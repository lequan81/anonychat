import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { v4 as uuid } from "uuid";
import "dotenv/config";

import chatLogger from "./logger.js";

const app = express();

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.static("public"));

const server = createServer(app);
const wss = new WebSocketServer({
  server,
  verifyClient: (info) => {
    // This is where you can add session management logic
    // The info object contains the request details
    return true; // Allow all connections for now
  },
});

// Debounce per session (cookie-based)
const sessionLastConnection = new Map();
const MIN_CONNECTION_INTERVAL = parseInt(process.env.MIN_CONNECTION_INTERVAL, 10) || 500; // ms

function getSessionId(req) {
  // For backward compatibility, check if there's a sessionId in query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionFromQuery = url.searchParams.get("sessionId");
  if (sessionFromQuery) {
    return sessionFromQuery;
  }

  // Check for session in cookies
  const cookieHeader = req.headers["cookie"];
  if (cookieHeader) {
    const cookies = Object.fromEntries(cookieHeader.split(";").map((c) => c.trim().split("=")));
    if (cookies.sessionid) return cookies.sessionid;
  }

  // Return null - we'll use the connection ID as user ID
  return null;
}

wss.on("connection", (ws, req) => {
  // Generate unique connection ID (this will be our user ID)
  const connectionId = uuid();
  ws.id = connectionId;
  ws.userId = connectionId; // User ID is the same as connection ID

  // Check for legacy session management
  let legacySessionId = getSessionId(req);
  ws.sessionId = legacySessionId || connectionId; // For backward compatibility

  console.log(`New connection: ${connectionId} (legacy session: ${legacySessionId || "none"})`);

  // Re-enable throttling but use session-based approach
  // Use session ID for throttling instead of connection ID
  const throttleKey = legacySessionId || req.connection.remoteAddress || connectionId;
  const now = Date.now();
  const last = sessionLastConnection.get(throttleKey) || 0;
  if (now - last < MIN_CONNECTION_INTERVAL) {
    console.log(`Connection rejected for ${throttleKey}: too fast (${now - last}ms < ${MIN_CONNECTION_INTERVAL}ms)`);
    ws.send(JSON.stringify({ type: "connection_rejected", reason: "[SYSTEM] Too many connections. Please wait." }));
    ws.close(parseInt(process.env.WS_CLOSE_CODE_THROTTLE, 10) || 4000, "Connection too fast");
    return;
  }
  sessionLastConnection.set(throttleKey, now);

  // Send connection established message with user ID
  ws.send(
    JSON.stringify({
      type: "connection_established",
      userId: connectionId,
      message: "Connection established successfully",
    })
  );

  handleNewConnection(ws, req);
});

const waiting = []; // Users waiting for a partner
const connections = new Set(); // All active WebSocket connections
const noPartnerTimeouts = new Map(); // Track timeout IDs for "no partner" messages

// 30 seconds timeout for "no partner available" message
const NO_PARTNER_TIMEOUT = parseInt(process.env.NO_PARTNER_TIMEOUT, 10) || 30000; // 30 seconds

// 2 days timeout for inactive pairs (in milliseconds)
const INACTIVE_PAIR_TIMEOUT = parseInt(process.env.INACTIVE_PAIR_TIMEOUT, 10) || 2 * 24 * 60 * 60 * 1000; // 2 days

/**
 * Starts a 30-second timer for "no partner available" message
 */
function startNoPartnerTimeout(ws) {
  // Clear existing timeout if any
  clearNoPartnerTimeout(ws);

  const timeoutId = setTimeout(() => {
    // Check if user is still waiting and no pairs available
    if (ws.readyState === ws.OPEN && !ws.partner && (connections.size <= 1 || waiting.length >= connections.size)) {
      safeSend(ws, { type: "system", system: "[SYSTEM] No partner available :(" });
      chatLogger.noPartnerTimeout(ws.id);
    }
    noPartnerTimeouts.delete(ws.id);
  }, NO_PARTNER_TIMEOUT);

  noPartnerTimeouts.set(ws.id, timeoutId);
}

/**
 * Clears all "no partner available" timeouts since new pairing opportunities exist
 */
function clearAllNoPartnerTimeouts() {
  noPartnerTimeouts.forEach((timeoutId, userId) => {
    clearTimeout(timeoutId);
  });
  noPartnerTimeouts.clear();
}

/**
 * Clears the "no partner available" timeout for a user
 */
function clearNoPartnerTimeout(ws) {
  const timeoutId = noPartnerTimeouts.get(ws.id);
  if (timeoutId) {
    clearTimeout(timeoutId);
    noPartnerTimeouts.delete(ws.id);
  }
}

/**
 * Sends statistics to all connected clients.
 */
function broadcastStats() {
  const stats = {
    type: "stats",
    onlineCount: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2), // Correctly calculate active pairs
  };

  connections.forEach((ws) => {
    safeSend(ws, stats);
  });
}

/**
 * Cleans up invalid or closed connections from the waiting queue.
 */
function cleanupWaiting() {
  const initialLength = waiting.length;
  // Iterate backwards to safely remove elements
  for (let i = waiting.length - 1; i >= 0; i--) {
    if (waiting[i].readyState !== waiting[i].OPEN) {
      // If the waiting connection is no longer open, remove it
      connections.delete(waiting[i]); // Ensure it's removed from global connections too
      waiting.splice(i, 1);
    }
  }

  const removed = initialLength - waiting.length;
  if (removed > 0) {
    chatLogger.cleanupPerformed(removed);
    chatLogger.updateStats({ waitingUsers: waiting.length });
    broadcastStats();
  }
}

/**
 * Cleans up inactive pairs that haven't sent messages for over 2 days.
 * This helps improve performance by removing stale connections.
 */
function cleanupInactivePairs() {
  const now = Date.now();
  const inactivePairs = [];
  const processedPairs = new Set();

  connections.forEach((ws) => {
    // Only check paired connections
    if (ws.partner && ws.readyState === ws.OPEN && ws.partner.readyState === ws.partner.OPEN) {
      // Create a unique pair identifier (sorted to avoid duplicates)
      const pairId = [ws.id, ws.partner.id].sort().join("-");

      // Skip if this pair has already been processed
      if (processedPairs.has(pairId)) {
        return;
      }

      const timeSinceLastMessage = now - (ws._lastMessageTime || ws._connectionStartTime || 0);

      // If no messages for over 2 days, mark for cleanup
      if (timeSinceLastMessage > INACTIVE_PAIR_TIMEOUT) {
        processedPairs.add(pairId);
        inactivePairs.push({
          user1: ws,
          user2: ws.partner,
          inactiveTime: timeSinceLastMessage,
          lastMessageTime: ws._lastMessageTime || ws._connectionStartTime || 0,
        });
      }
    }
  });

  // Disconnect inactive pairs
  inactivePairs.forEach(({ user1, user2, inactiveTime }) => {
    chatLogger.inactivePairCleanup(user1.id, user2.id, inactiveTime);

    // Send inactivity disconnect message to both users
    safeSend(user1, {
      type: "system",
      system: "[SYSTEM] Connection closed due to inactivity (2+ days without messages).",
    });
    safeSend(user2, {
      type: "system",
      system: "[SYSTEM] Connection closed due to inactivity (2+ days without messages).",
    });

    // Close both connections
    setTimeout(() => {
      if (user1.readyState === user1.OPEN) {
        user1.close(parseInt(process.env.WS_CLOSE_CODE_NORMAL, 10) || 1000, "Inactive for 2+ days");
      }
      if (user2.readyState === user2.OPEN) {
        user2.close(parseInt(process.env.WS_CLOSE_CODE_NORMAL, 10) || 1000, "Inactive for 2+ days");
      }
    }, parseInt(process.env.INACTIVE_PAIR_CLOSE_DELAY, 10) || 2000); // Give time for the message to be sent
  });

  if (inactivePairs.length > 0) {
    chatLogger.log(`Cleaned up ${inactivePairs.length} inactive pairs`);
    broadcastStats();
  }
}

/**
 * Pairs two WebSocket connections.
 * @param {WebSocket} a - The first WebSocket connection.
 * @param {WebSocket} b - The second WebSocket connection.
 * @returns {boolean} True if pairing was successful, false otherwise.
 */
function pair(a, b) {
  // Validate both connections are still open before pairing
  if (a.readyState !== a.OPEN || b.readyState !== b.OPEN) {
    console.warn(`[PAIRING] One or both connections not open. a.id=${a.id}, b.id=${b.id}`);
    return false;
  }

  // Assign partners to each other
  a.partner = b;
  b.partner = a;
  a.isAlive = true; // Mark as alive
  b.isAlive = true; // Mark as alive

  // Store pairing start time for minimum duration logic
  const now = Date.now();
  a._pairStartTime = now;
  b._pairStartTime = now;

  // Initialize last message timestamp for inactivity tracking
  a._lastMessageTime = now;
  b._lastMessageTime = now;

  chatLogger.usersPaired(a.id, b.id);
  return true;
}

/**
 * Safely sends data to a WebSocket connection.
 * Handles potential errors like connection not being open.
 * @param {WebSocket} ws - The WebSocket connection.
 * @param {Object} data - The data to send.
 * @returns {boolean} True if data was sent successfully, false otherwise.
 */
function safeSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      // Log errors during send, but don't terminate connection here
      chatLogger.connectionError(ws.id, error);
      return false;
    }
  }
  return false;
}

/**
 * Handles the disconnection of a WebSocket client.
 * @param {WebSocket} ws - The disconnected WebSocket connection.
 */
function disconnect(ws) {
  if (!connections.has(ws)) {
    // Already disconnected or not a tracked connection
    return;
  }

  connections.delete(ws);
  chatLogger.userDisconnected(ws.id, "normal_disconnect");

  // Clear any pending "no partner" timeout
  clearNoPartnerTimeout(ws);

  // Remove from waiting queue if present
  const waitingIndex = waiting.indexOf(ws);
  if (waitingIndex >= 0) {
    waiting.splice(waitingIndex, 1);
    chatLogger.updateStats({ waitingUsers: waiting.length });
  }

  // Handle the partner's disconnection
  if (ws.partner && ws.partner.readyState === ws.partner.OPEN) {
    safeSend(ws.partner, { type: "system", system: "[SYSTEM] Stranger has disconnected." });
    chatLogger.pairDisconnected(ws.id, ws.partner.id, "partner_disconnect");

    // Clear partner reference
    const partnerWs = ws.partner;
    partnerWs.partner = null;
    ws.partner = null; // Clear from the disconnected WS too

    // Calculate minimum pairing duration for the partner
    const now = Date.now();
    const pairStart = partnerWs._pairStartTime || 0;
    const minPairDuration = parseInt(process.env.MIN_PAIR_DURATION, 10) || 4000; // 4 seconds
    const timePaired = now - pairStart;
    const delayBeforeReQueue = Math.max(minPairDuration - timePaired, 0); // Ensures min pair duration

    // Only add to waiting if not already there, and after a random cooldown (1-3s)
    if (!waiting.includes(partnerWs)) {
      partnerWs._lastPartnerId = ws.id; // Store last partner ID to avoid immediate re-pairing
      const cooldown =
        parseInt(process.env.PAIRING_COOLDOWN_MIN, 10) ||
        1000 + Math.floor(Math.random() * (parseInt(process.env.PAIRING_COOLDOWN_MAX, 10) || 3000)); // Random cooldown between 1-3s

      setTimeout(() => {
        // Re-check state after delay and cooldown
        if (!partnerWs.partner && partnerWs.readyState === partnerWs.OPEN) {
          partnerWs._lastWaitingTime = Date.now(); // Record time when user started waiting again
          waiting.push(partnerWs);
          chatLogger.userWaiting(partnerWs.id);
          safeSend(partnerWs, { type: "system", system: "[SYSTEM] Waiting for a stranger..." });
          // Start 30-second timeout for "no partner available" message
          startNoPartnerTimeout(partnerWs);
        }
      }, delayBeforeReQueue + cooldown);
    }
  } else if (ws.partner) {
    // If partner exists but is not OPEN, ensure partner reference is cleared on disconnected WS
    ws.partner.partner = null; // Clear partner's partner reference
    ws.partner = null; // Clear current WS's partner reference
  }

  // Broadcast updated stats after any disconnections
  broadcastStats();
}

/**
 * Handles a new WebSocket connection.
 * @param {WebSocket} ws - The new WebSocket connection.
 * @param {Request} req - The incoming request object.
 */
function handleNewConnection(ws, req) {
  // Connection ID and user ID are already set in the connection handler
  ws.isAlive = true; // Used for heartbeat mechanism
  ws.partner = null; // Initialize partner to null
  ws._pairStartTime = 0; // Initialize pair start time
  ws._lastPartnerId = null; // Initialize last partner ID
  ws._lastWaitingTime = 0; // Initialize last waiting time
  ws._connectionStartTime = Date.now(); // Track connection start time for debugging
  ws._lastMessageTime = Date.now(); // Track last message time for inactivity cleanup

  connections.add(ws);
  chatLogger.userConnected(ws.id);

  // Clear all existing "no partner" timeouts since new pairing opportunities exist
  clearAllNoPartnerTimeouts();

  // Send initial stats to the newly connected client
  safeSend(ws, {
    type: "stats",
    onlineCount: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2),
  });

  // Event handlers for the WebSocket connection
  ws.on("pong", () => {
    ws.isAlive = true; // Mark as alive on pong response
  });

  ws.on("close", (code, reason) => {
    // Calculate connection duration for debugging
    const connectionDuration = ws._connectionStartTime ? Date.now() - ws._connectionStartTime : 0;
    console.log(`Connection closed: ${ws.id}, code: ${code}, reason: ${reason}, duration: ${connectionDuration}ms`);

    // This is the primary close handler. It calls disconnect.
    disconnect(ws);
  });

  ws.on("error", (error) => {
    chatLogger.connectionError(ws.id, error);
    disconnect(ws); // Treat errors like a close event for cleanup
  });

  ws.on("message", (data) => {
    ws.isAlive = true; // Mark as alive on any message activity

    let msg;
    try {
      msg = JSON.parse(data);
    } catch (error) {
      chatLogger.connectionError(ws.id, new Error("Invalid JSON message received."));
      safeSend(ws, { type: "system", system: "[SYSTEM] Invalid message format. Please send valid JSON." });
      return;
    }

    // If the message is not an object or missing type, reject it
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
      chatLogger.connectionError(ws.id, new Error("Message missing type field."));
      safeSend(ws, { type: "system", system: "[SYSTEM] Message missing type field." });
      return;
    }

    switch (msg.type) {
      case "receipt":
        // Check if the user has a partner before processing partner-dependent messages
        if (!ws.partner || ws.partner.readyState !== ws.partner.OPEN) {
          attemptPairing(ws);
          return;
        }
        // Forward delivery receipt to partner
        if (msg.messageId) {
          safeSend(ws.partner, {
            type: "receipt",
            messageId: msg.messageId,
          });
        }
        break;
      case "text":
        // Check if the user has a partner before processing partner-dependent messages
        if (!ws.partner || ws.partner.readyState !== ws.partner.OPEN) {
          attemptPairing(ws);
          return;
        }
        if (typeof msg.data === "string" && msg.data.trim().length > 0) {
          const messageId = msg.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

          // Update last message time for both users to track activity
          const now = Date.now();
          ws._lastMessageTime = now;
          ws.partner._lastMessageTime = now;

          chatLogger.messageSent(ws.id, ws.partner.id, msg.data.length);

          // Send to sender (self)
          safeSend(ws, {
            type: "text",
            data: msg.data,
            from: "self",
            id: messageId,
          });

          // Send to partner
          safeSend(ws.partner, {
            type: "text",
            data: msg.data,
            from: "stranger",
            id: messageId,
          });
        }
        break;
      case "typing":
        // Check if the user has a partner before processing partner-dependent messages
        if (!ws.partner || ws.partner.readyState !== ws.partner.OPEN) {
          attemptPairing(ws);
          return;
        }
        chatLogger.typingIndicator(ws.id, ws.partner.id);
        safeSend(ws.partner, { type: "typing" });
        break;
      case "ping":
        // Respond to ping with pong for heartbeat
        safeSend(ws, { type: "pong" });
        break;
      default:
        chatLogger.connectionError(ws.id, new Error(`Unknown message type: ${msg.type}`));
        safeSend(ws, { type: "system", system: "[SYSTEM] Unknown message type received." });
        break;
    }
  });

  // Attempt to pair the new connection
  attemptPairing(ws);
}

/**
 * Attempts to pair a given WebSocket connection with another waiting user.
 * @param {WebSocket} newWs - The WebSocket connection to pair.
 */
function attemptPairing(newWs) {
  // Ensure cleanup happens before every pairing attempt
  cleanupWaiting();

  if (newWs.partner) {
    // Already paired, no need to pair again
    return;
  }

  // Look for a suitable partner in the waiting queue
  let potentialPartner = null;
  for (let i = 0; i < waiting.length; i++) {
    const candidate = waiting[i];

    // Conditions for a valid candidate:
    // 1. Candidate must be open.
    // 2. Candidate must not already have a partner.
    // 3. Candidate must not be the new connection itself.
    // 4. Avoid immediate re-pairing with the last partner (if any).
    // 5. If the candidate was previously partnered with newWs, ensure a minimum time has passed
    //    since they were added back to the waiting queue (to prevent flip-flopping).
    const now = Date.now();
    const COOLDOWN_AFTER_LAST_PARTNER = parseInt(process.env.COOLDOWN_AFTER_LAST_PARTNER, 10) || 2000; // 2 seconds cooldown before re-pairing with same ID
    const COOLDOWN_FOR_REQUEUE = parseInt(process.env.COOLDOWN_FOR_REQUEUE, 10) || 2000; // 2 seconds cooldown for partner that just disconnected

    const isDifferentUser = candidate.id !== newWs.id;
    const isDifferentSession = candidate.userId !== newWs.userId; // Prevent self-pairing using userId
    const isNotAlreadyPaired = !candidate.partner;
    const isCandidateOpen = candidate.readyState === candidate.OPEN;
    const isNotLastPartner = !newWs._lastPartnerId || newWs._lastPartnerId !== candidate.id;
    const isEnoughTimeAfterLastPair =
      !candidate._lastPartnerId ||
      candidate._lastPartnerId !== newWs.id ||
      now - (candidate._lastWaitingTime || 0) > COOLDOWN_AFTER_LAST_PARTNER;

    if (
      isCandidateOpen &&
      isNotAlreadyPaired &&
      isDifferentUser &&
      isDifferentSession &&
      isNotLastPartner &&
      isEnoughTimeAfterLastPair
    ) {
      potentialPartner = waiting.splice(i, 1)[0]; // Remove from waiting queue
      console.log(
        `Pairing successful: ${newWs.id} (userId: ${newWs.userId}) with ${candidate.id} (userId: ${candidate.userId})`
      );
      break;
    } else if (!isCandidateOpen || candidate.partner) {
      // If the candidate is dead or already paired, remove it from waiting
      waiting.splice(i, 1);
      i--; // Adjust index because an element was removed
    } else {
      // Log why pairing was rejected for debugging
      console.log(`Pairing rejected for ${newWs.id} with ${candidate.id}:`, {
        isCandidateOpen,
        isNotAlreadyPaired,
        isDifferentUser,
        isDifferentSession: candidate.userId !== newWs.userId,
        isNotLastPartner,
        isEnoughTimeAfterLastPair,
        newWsUserId: newWs.userId,
        candidateUserId: candidate.userId,
      });
    }
  }

  if (potentialPartner && pair(newWs, potentialPartner)) {
    safeSend(newWs, { type: "system", system: "[SYSTEM] Connected to a stranger." });
    safeSend(potentialPartner, { type: "system", system: "[SYSTEM] Connected to a stranger." });
    // Clear timeouts for both users since they found partners
    clearNoPartnerTimeout(newWs);
    clearNoPartnerTimeout(potentialPartner);
  } else {
    // If no partner found or pairing failed, add the current user to the waiting queue
    if (!waiting.includes(newWs)) {
      newWs._lastWaitingTime = Date.now(); // Record when user starts waiting
      waiting.push(newWs);
      chatLogger.userWaiting(newWs.id);
      safeSend(newWs, { type: "system", system: "[SYSTEM] Waiting for a stranger..." });
      // Start 30-second timeout for "no partner available" message
      startNoPartnerTimeout(newWs);
    }
  }

  // Always broadcast updated stats after connection handling
  broadcastStats();
}

// --- Server Maintenance ---

// Heartbeat mechanism to detect dead connections
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL, 10) || 60000; // 60 seconds
const heartbeat = setInterval(() => {
  let aliveCount = 0;
  let deadCount = 0;

  connections.forEach((ws) => {
    if (ws.isAlive === false) {
      // If a connection did not respond to the previous ping, it's considered dead
      deadCount++;
      disconnect(ws); // Clean up associated resources and partner
      ws.terminate(); // Forcefully close the connection
      return;
    }

    aliveCount++;
    ws.isAlive = false; // Mark as not alive, will be set to true on pong
    if (ws.readyState === ws.OPEN) {
      ws.ping(); // Send ping to check if still alive
    }
  });

  chatLogger.heartbeatCheck(aliveCount, deadCount);
}, HEARTBEAT_INTERVAL);

// Periodically clean up the waiting queue
const cleanup = setInterval(() => {
  cleanupWaiting();
}, parseInt(process.env.CLEANUP_INTERVAL, 10) || 60000); // Default: Clean every minute

// Periodically clean up inactive pairs (every 30 minutes)
const inactiveCleanup = setInterval(() => {
  cleanupInactivePairs();
}, parseInt(process.env.INACTIVE_CLEANUP_INTERVAL, 10) || 30 * 60 * 1000); // Default: Clean every 30 minutes

// Periodically broadcast stats to all clients
const statsBroadcast = setInterval(() => {
  broadcastStats();
}, parseInt(process.env.STATS_BROADCAST_INTERVAL, 10) || 10000); // Default: Broadcast every 10 seconds

// --- Graceful Shutdown ---

const stopServer = () => {
  chatLogger.serverStopped();
  clearInterval(heartbeat);
  clearInterval(cleanup);
  clearInterval(inactiveCleanup);
  clearInterval(statsBroadcast);
  wss.clients.forEach((ws) => ws.terminate()); // Terminate all client connections
  server.close(() => {
    console.log("Server gracefully stopped.");
    process.exit(0);
  });
};

process.on("SIGTERM", stopServer); // Handle termination signals
process.on("SIGINT", stopServer); // Handle interrupt signals (Ctrl+C)

// WebSocket server close event (redundant with process.on, but good to have)
wss.on("close", () => {
  clearInterval(heartbeat);
  clearInterval(cleanup);
  clearInterval(inactiveCleanup);
  clearInterval(statsBroadcast);
  chatLogger.log("WebSocket server closed.");
});

// --- Server Start ---

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  chatLogger.serverStarted(PORT);
  console.log(`🚀 http://localhost:${PORT}`);
});
