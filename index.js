import express from "express";
import { createServer } from "http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { WebSocketServer } from "ws";
import { v4 as uuid } from "uuid";
import chatLogger from "./logger.js";
import { appendMessageLog } from "./messageLog.js";
import { appendFeedbackLog, readRecentFeedback } from "./feedbackLog.js";

const app = express();
const publicDirectory = path.resolve("public");
app.use((request, response, next) => {
  response.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
});
app.use(express.json({ limit: "16kb" }));
app.use(express.static(publicDirectory));
app.use("/api/admin", (request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});

const server = createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 7 * 1024 * 1024,
});

const waiting = [];
const connections = new Set();
const clients = new Map();
const blockedPairs = new Map();
let isShuttingDown = false;
app.get("/healthz", (request, response) => {
  response
    .status(isShuttingDown ? 503 : 200)
    .type("text/plain")
    .send(isShuttingDown ? "shutting down" : "ok");
});
const reconnectGraceSeconds = Number(
  process.env.RECONNECT_GRACE_SECONDS ?? 120,
);
const heartbeatIntervalSeconds = Number(
  process.env.WS_HEARTBEAT_INTERVAL_SECONDS ?? 15,
);
const heartbeatMissedThreshold = Number(
  process.env.WS_HEARTBEAT_MISSED_THRESHOLD ?? 3,
);
const pairRematchCooldownSeconds = Number(
  process.env.PAIR_REMATCH_COOLDOWN_SECONDS ?? 15,
);
const messageLoggingSetting = (
  process.env.MESSAGE_LOGGING_ENABLED ?? "true"
).toLowerCase();

if (!Number.isInteger(reconnectGraceSeconds) || reconnectGraceSeconds <= 0) {
  throw new Error("RECONNECT_GRACE_SECONDS must be a positive integer");
}
if (
  !Number.isInteger(heartbeatIntervalSeconds) ||
  heartbeatIntervalSeconds <= 0
) {
  throw new Error("WS_HEARTBEAT_INTERVAL_SECONDS must be a positive integer");
}
if (
  !Number.isInteger(heartbeatMissedThreshold) ||
  heartbeatMissedThreshold < 1
) {
  throw new Error(
    "WS_HEARTBEAT_MISSED_THRESHOLD must be a positive integer >= 1",
  );
}
if (
  !Number.isInteger(pairRematchCooldownSeconds) ||
  pairRematchCooldownSeconds <= 0
) {
  throw new Error("PAIR_REMATCH_COOLDOWN_SECONDS must be a positive integer");
}
if (messageLoggingSetting !== "true" && messageLoggingSetting !== "false") {
  throw new Error("MESSAGE_LOGGING_ENABLED must be true or false");
}
const RECONNECT_GRACE_MS = reconnectGraceSeconds * 1000;
const WS_HEARTBEAT_INTERVAL_MS = heartbeatIntervalSeconds * 1000;
const PAIR_REMATCH_COOLDOWN_MS = pairRematchCooldownSeconds * 1000;
const MESSAGE_LOGGING_ENABLED = messageLoggingSetting === "true";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_MESSAGE_LENGTH = 2000;
const MAX_FEEDBACK_LENGTH = 2000;
const MAX_FEEDBACK_USERNAME_LENGTH = 80;
const FEEDBACK_COOLDOWN_MS = 60 * 1000;
const MAX_ADMIN_ANNOUNCEMENT_LENGTH = 1000;
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();
const failedAdminLogins = new Map(); // ip -> { count: number, lockedUntil: number }
const MAX_ADMIN_LOGIN_ATTEMPTS = 5;
const ADMIN_LOCK_DURATION_MS = 15 * 60 * 1000;

const CONTROL_AND_BIDI_REGEX =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

function sanitizeTextInput(rawText, maxLength = MAX_TEXT_MESSAGE_LENGTH) {
  if (typeof rawText !== "string") return "";
  const sanitized = rawText
    .normalize("NFC")
    .replace(CONTROL_AND_BIDI_REGEX, "")
    .trim();
  return sanitized.slice(0, maxLength);
}

const MAX_CONCURRENT_WS_PER_IP = Number(
  process.env.MAX_CONCURRENT_WS_PER_IP ?? 3,
);
const MAX_WS_CONNECTS_PER_MINUTE = Number(
  process.env.MAX_WS_CONNECTS_PER_MINUTE ?? 10,
);
const wsConnectionsByIp = new Map(); // ip -> Set<ws>
const wsConnectTimestampsByIp = new Map(); // ip -> number[]

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress || "unknown";
}

function isOriginAllowed(origin, host) {
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    if (
      originUrl.host === host ||
      originUrl.hostname === "localhost" ||
      originUrl.hostname === "127.0.0.1"
    ) {
      return true;
    }
    if (process.env.ALLOWED_ORIGINS) {
      const allowed = process.env.ALLOWED_ORIGINS.split(",").map((o) =>
        o.trim().toLowerCase(),
      );
      if (
        allowed.includes(origin.toLowerCase()) ||
        allowed.includes(originUrl.origin.toLowerCase())
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function isAdminPasswordValid(password) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (typeof configuredPassword !== "string" || !configuredPassword)
    return false;

  const supplied = Buffer.from(password);
  const expected = Buffer.from(configuredPassword);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

function getAdminSession(request) {
  const authorization = request.get("authorization") ?? "";
  const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization);
  if (!match) return null;

  const expiresAt = adminSessions.get(match[1]);
  if (!expiresAt) return null;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(match[1]);
    return null;
  }
  return match[1];
}

app.post("/api/admin/login", (request, response) => {
  const clientIp = getClientIp(request);
  const now = Date.now();
  const lockInfo = failedAdminLogins.get(clientIp);

  if (lockInfo && lockInfo.lockedUntil > now) {
    const remainingMinutes = Math.ceil((lockInfo.lockedUntil - now) / 60000);
    response.status(429).json({
      error: `Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${remainingMinutes} phút.`,
    });
    return;
  }

  if (!process.env.ADMIN_PASSWORD) {
    response
      .status(503)
      .json({ error: "Trang admin chưa được cấu hình trên server." });
    return;
  }
  if (
    typeof request.body?.password !== "string" ||
    !isAdminPasswordValid(request.body.password)
  ) {
    const attempts = (lockInfo?.count || 0) + 1;
    const lockedUntil =
      attempts >= MAX_ADMIN_LOGIN_ATTEMPTS ? now + ADMIN_LOCK_DURATION_MS : 0;
    failedAdminLogins.set(clientIp, { count: attempts, lockedUntil });

    if (lockedUntil > 0) {
      response.status(429).json({
        error: "Bạn đã nhập sai mật khẩu 5 lần. IP bị tạm khóa trong 15 phút.",
      });
      return;
    }

    response.status(401).json({
      error: `Mật khẩu admin không đúng. Còn ${MAX_ADMIN_LOGIN_ATTEMPTS - attempts} lần thử.`,
    });
    return;
  }

  failedAdminLogins.delete(clientIp);

  // prune expired sessions
  for (const [token, expiresAt] of adminSessions) {
    if (expiresAt <= now) adminSessions.delete(token);
  }

  const token = randomBytes(32).toString("hex");
  adminSessions.set(token, now + ADMIN_SESSION_TTL_MS);
  response.json({ token, expiresInSeconds: ADMIN_SESSION_TTL_MS / 1000 });
});

app.post("/api/admin/announcements", (request, response) => {
  if (!getAdminSession(request)) {
    response
      .status(401)
      .json({ error: "Phiên admin đã hết hạn. Vui lòng đăng nhập lại." });
    return;
  }

  const message = sanitizeTextInput(
    request.body?.message,
    MAX_ADMIN_ANNOUNCEMENT_LENGTH,
  );
  if (!message) {
    response.status(400).json({
      error: `Thông báo phải dài từ 1 đến ${MAX_ADMIN_ANNOUNCEMENT_LENGTH} ký tự hợp lệ.`,
    });
    return;
  }

  let recipientCount = 0;
  connections.forEach((ws) => {
    if (safeSend(ws, { type: "announcement", message })) recipientCount++;
  });
  response.json({ recipientCount });
});

app.get("/api/admin/feedback", async (request, response) => {
  if (!getAdminSession(request)) {
    response
      .status(401)
      .json({ error: "Phiên admin đã hết hạn. Vui lòng đăng nhập lại." });
    return;
  }

  try {
    const feedback = await readRecentFeedback();
    response.json({ feedback });
  } catch (error) {
    chatLogger.connectionError("admin-feedback", error);
    response.status(500).json({ error: "Không thể tải góp ý lúc này." });
  }
});

app.get("/api/admin/stats", (request, response) => {
  if (!getAdminSession(request)) {
    response
      .status(401)
      .json({ error: "Phiên admin đã hết hạn. Vui lòng đăng nhập lại." });
    return;
  }

  response.json({
    onlineCount: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2),
  });
});

app.delete("/api/admin/session", (request, response) => {
  const token = getAdminSession(request);
  if (!token) {
    response.status(401).json({ error: "Phiên admin đã hết hạn." });
    return;
  }

  adminSessions.delete(token);
  response.status(204).end();
});

app.get("/admin", (request, response) => {
  response.sendFile(path.join(publicDirectory, "index.html"));
});

function decodeImageData(data) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[1].length % 4 !== 0) {
    return null;
  }

  const imageBytes = Buffer.from(match[1], "base64");
  if (
    imageBytes.length === 0 ||
    imageBytes.length > MAX_IMAGE_BYTES ||
    imageBytes.toString("base64") !== match[1] ||
    imageBytes[0] !== 0xff ||
    imageBytes[1] !== 0xd8 ||
    imageBytes[2] !== 0xff
  ) {
    return null;
  }

  return imageBytes;
}

function broadcastStats() {
  const stats = {
    type: "stats",
    onlineCount: connections.size,
  };

  connections.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(stats));
      } catch (error) {
        console.log("Error broadcasting stats:", error);
      }
    }
  });
}

function cleanupWaiting() {
  const initialLength = waiting.length;
  for (let i = waiting.length - 1; i >= 0; i--) {
    if (waiting[i].readyState !== waiting[i].OPEN) {
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

function pair(a, b) {
  // Validate both connections are still open
  if (a.readyState !== a.OPEN || b.readyState !== b.OPEN) {
    return false;
  }

  a.partner = b;
  b.partner = a;
  a.isAlive = true;
  b.isAlive = true;
  a.session.partnerId = b.session.clientId;
  b.session.partnerId = a.session.clientId;
  a.session.waiting = false;
  b.session.waiting = false;

  chatLogger.usersPaired(a.id, b.id);
  return true;
}

function pairKey(clientIdA, clientIdB) {
  return [clientIdA, clientIdB].sort().join(":");
}

function isPairBlocked(clientIdA, clientIdB) {
  const key = pairKey(clientIdA, clientIdB);
  const block = blockedPairs.get(key);
  if (!block) return false;
  if (block.expiresAt > Date.now()) return true;

  clearTimeout(block.timer);
  blockedPairs.delete(key);
  return false;
}

function blockPair(clientIdA, clientIdB) {
  const key = pairKey(clientIdA, clientIdB);
  const existingBlock = blockedPairs.get(key);
  if (existingBlock) clearTimeout(existingBlock.timer);

  const expiresAt = Date.now() + PAIR_REMATCH_COOLDOWN_MS;
  const timer = setTimeout(() => {
    const currentBlock = blockedPairs.get(key);
    if (currentBlock?.expiresAt !== expiresAt) return;

    blockedPairs.delete(key);
    matchWaiting();
    updateConnectionStats();
  }, PAIR_REMATCH_COOLDOWN_MS);
  timer.unref();
  blockedPairs.set(key, { expiresAt, timer });
}

function matchWaiting() {
  cleanupWaiting();

  for (let i = 0; i < waiting.length; i++) {
    const a = waiting[i];
    if (a.readyState !== a.OPEN || a.partner) continue;

    const candidates = [];
    for (let j = i + 1; j < waiting.length; j++) {
      const b = waiting[j];
      if (
        b.readyState === b.OPEN &&
        !b.partner &&
        !isPairBlocked(a.session.clientId, b.session.clientId)
      ) {
        candidates.push(j);
      }
    }
    if (candidates.length === 0) continue;

    const secondIndex =
      candidates[Math.floor(Math.random() * candidates.length)];
    const b = waiting.splice(secondIndex, 1)[0];
    waiting.splice(i, 1);
    if (!pair(a, b)) {
      i--;
      continue;
    }

    safeSend(a, { system: "[SYSTEM] Connected to a stranger." });
    safeSend(b, { system: "[SYSTEM] Connected to a stranger." });
    i--;
  }
}

function safeSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      chatLogger.connectionError(ws.id, error);
      return false;
    }
  }
  return false;
}

function updateConnectionStats() {
  chatLogger.updateStats({
    currentConnections: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2),
  });
  broadcastStats();
}

function expireSession(session) {
  if (clients.get(session.clientId) !== session || session.ws) return;

  clients.delete(session.clientId);
  session.reconnectTimer = null;

  if (session.partnerId) {
    const partnerSession = clients.get(session.partnerId);
    session.partnerId = null;

    if (partnerSession?.partnerId === session.clientId) {
      partnerSession.partnerId = null;
      const partner = partnerSession.ws;

      if (partner && partner.readyState === partner.OPEN) {
        partner.partner = null;
        safeSend(partner, { system: "[SYSTEM] Stranger disconnected." });
        chatLogger.pairDisconnected(
          session.clientId,
          partnerSession.clientId,
          "reconnect_timeout",
        );

        if (!partnerSession.waiting) {
          enqueueSession(partnerSession);
          safeSend(partner, { system: "[SYSTEM] Waiting for a stranger…" });
        }
        matchWaiting();
      }
    }
  }

  updateConnectionStats();
}

function disconnect(ws) {
  if (ws.clientIp) {
    const ipSockets = wsConnectionsByIp.get(ws.clientIp);
    if (ipSockets) {
      ipSockets.delete(ws);
      if (ipSockets.size === 0) wsConnectionsByIp.delete(ws.clientIp);
    }
  }

  const session = ws.session;
  connections.delete(ws);

  // A replaced socket must not disconnect the newer socket for this client.
  if (!session || session.ws !== ws) return;

  // Cancel any in-flight image transfers initiated by this socket
  if (ws.imageTransfers?.size > 0) {
    const currentPartner = ws.partner;
    for (const [transferId, transfer] of ws.imageTransfers) {
      clearTimeout(transfer.timeout);
      if (currentPartner?.readyState === currentPartner?.OPEN) {
        safeSend(currentPartner, {
          type: "image_cancel",
          id: transferId,
          reason: "disconnected",
        });
      }
    }
    ws.imageTransfers.clear();
  }

  session.ws = null;
  chatLogger.userDisconnected(ws.id, "connection_lost");

  const waitingIndex = waiting.indexOf(ws);
  if (waitingIndex >= 0) {
    waiting.splice(waitingIndex, 1);
    session.queuedPosition = waitingIndex;
  }

  if (session.partnerId) {
    const partnerSession = clients.get(session.partnerId);
    const partner = partnerSession?.ws;
    if (partner && partner.readyState === partner.OPEN) {
      safeSend(partner, {
        system: "[SYSTEM] Stranger connection lost. Reconnecting…",
        reconnectSeconds: reconnectGraceSeconds,
      });
    }
  }

  clearTimeout(session.reconnectTimer);
  session.reconnectTimer = isShuttingDown
    ? null
    : setTimeout(() => expireSession(session), RECONNECT_GRACE_MS);
  updateConnectionStats();
}

function enqueueSession(session, position = waiting.length) {
  const ws = session.ws;
  if (!ws || ws.readyState !== ws.OPEN || waiting.includes(ws)) return;

  waiting.splice(Math.min(position, waiting.length), 0, ws);
  session.waiting = true;
  session.queuedPosition = null;
  chatLogger.userWaiting(ws.id);
}

function endConversation(ws) {
  const session = ws.session;
  const partnerSession = session?.partnerId
    ? clients.get(session.partnerId)
    : null;
  if (!session || !partnerSession) return;

  const partner = partnerSession.ws;
  const partnerIsConnected = Boolean(
    partner && partner.readyState === partner.OPEN,
  );

  blockPair(session.clientId, partnerSession.clientId);
  ws.partner = null;
  session.partnerId = null;
  if (partnerSession.partnerId === session.clientId) {
    partnerSession.partnerId = null;
  }

  clearTimeout(session.reconnectTimer);
  session.reconnectTimer = null;
  session.waiting = false;
  session.queuedPosition = null;

  if (partnerIsConnected) {
    partner.partner = null;
    clearTimeout(partnerSession.reconnectTimer);
    partnerSession.reconnectTimer = null;
    partnerSession.waiting = false;
    partnerSession.queuedPosition = null;
  }

  chatLogger.pairDisconnected(
    session.clientId,
    partnerSession.clientId,
    "ended_by_user",
  );
  safeSend(ws, {
    system: "[SYSTEM] Conversation ended. Finding a new stranger…",
  });
  if (partnerIsConnected) {
    safeSend(partner, {
      system: "[SYSTEM] Conversation ended. Finding a new stranger…",
    });
  }

  enqueueSession(session);
  if (partnerIsConnected) enqueueSession(partnerSession);
  matchWaiting();

  if (session.waiting)
    safeSend(ws, { system: "[SYSTEM] Waiting for a stranger…" });
  if (partnerIsConnected && partnerSession.waiting) {
    safeSend(partner, { system: "[SYSTEM] Waiting for a stranger…" });
  }
  updateConnectionStats();
}

const IMAGE_CHUNK_HEADER = 40; // 36 bytes UUID + 4 bytes chunkIndex uint32 BE
const MAX_IMAGE_CHUNKS = Math.ceil(MAX_IMAGE_BYTES / (64 * 1024)) + 1; // ~80 for 5MB

function handleBinaryChunk(ws, data) {
  if (!Buffer.isBuffer(data) || data.length < IMAGE_CHUNK_HEADER) return;

  const transferId = data.subarray(0, 36).toString("ascii");
  const chunkIndex = data.readUInt32BE(36);

  const transfer = ws.imageTransfers?.get(transferId);
  if (!transfer) return;
  if (chunkIndex >= transfer.totalChunks) return;

  const partner = ws.partner;
  if (!partner || partner.readyState !== partner.OPEN) {
    clearTimeout(transfer.timeout);
    ws.imageTransfers.delete(transferId);
    safeSend(ws, {
      type: "image_cancel",
      id: transferId,
      reason: "no_partner",
    });
    return;
  }

  try {
    partner.send(data, { binary: true });
  } catch (err) {
    chatLogger.connectionError(ws.id, err);
    return;
  }

  transfer.chunksRelayed++;
  if (transfer.chunksRelayed >= transfer.totalChunks) {
    chatLogger.messageSent(ws.id, partner.id, transfer.totalBytes);
    if (MESSAGE_LOGGING_ENABLED) {
      appendMessageLog({
        timestamp: new Date().toISOString(),
        fromUuid: ws.session.clientId,
        toUuid: partner.session.clientId,
        type: "image",
        message: `[chunked:${transfer.totalChunks}:${transfer.totalBytes}b]`,
      }).catch((err) => chatLogger.connectionError(ws.id, err));
    }
    clearTimeout(transfer.timeout);
    ws.imageTransfers.delete(transferId);
  }
}

wss.on("connection", (ws, request) => {
  const clientIp = getClientIp(request);

  if (!isOriginAllowed(request.headers.origin, request.headers.host)) {
    chatLogger.connectionError(
      "ws-origin",
      new Error(
        `Origin not allowed: ${request.headers.origin} from IP ${clientIp}`,
      ),
    );
    ws.close(1008, "Origin not allowed");
    return;
  }

  const now = Date.now();
  let timestamps = wsConnectTimestampsByIp.get(clientIp) || [];
  timestamps = timestamps.filter((t) => now - t < 60000);
  if (timestamps.length >= MAX_WS_CONNECTS_PER_MINUTE) {
    chatLogger.connectionError(
      "ws-rate-limit",
      new Error(`Connection rate limit reached for IP ${clientIp}`),
    );
    ws.close(1008, "Too many connections, please wait a moment");
    return;
  }
  timestamps.push(now);
  wsConnectTimestampsByIp.set(clientIp, timestamps);

  let ipSockets = wsConnectionsByIp.get(clientIp);
  if (!ipSockets) {
    ipSockets = new Set();
    wsConnectionsByIp.set(clientIp, ipSockets);
  }
  if (ipSockets.size >= MAX_CONCURRENT_WS_PER_IP) {
    chatLogger.connectionError(
      "ws-concurrency",
      new Error(`Max concurrent connections reached for IP ${clientIp}`),
    );
    ws.close(1008, "Too many active sessions from this IP");
    return;
  }
  ipSockets.add(ws);
  ws.clientIp = clientIp;
  ws.rateWindow = { start: Date.now(), textCount: 0, eventCount: 0 };

  const clientId = new URL(request.url, "http://localhost").searchParams.get(
    "clientId",
  );
  if (
    !clientId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      clientId,
    )
  ) {
    ws.close(1008, "A valid clientId is required");
    return;
  }

  ws.id = uuid();
  let session = clients.get(clientId);
  const isReconnect = Boolean(session);

  if (session) {
    clearTimeout(session.reconnectTimer);

    if (session.ws) {
      const previousSocket = session.ws;
      connections.delete(previousSocket);
      chatLogger.userDisconnected(previousSocket.id, "replaced_connection");

      const previousWaitingIndex = waiting.indexOf(previousSocket);
      if (previousWaitingIndex >= 0) {
        waiting.splice(previousWaitingIndex, 1);
        session.queuedPosition = previousWaitingIndex;
      }

      previousSocket.close(4001, "Reconnected from this client");
    }
  } else {
    session = {
      clientId,
      ws: null,
      partnerId: null,
      reconnectTimer: null,
      waiting: false,
      queuedPosition: null,
    };
    clients.set(clientId, session);
  }

  session.ws = ws;
  ws.session = session;
  connections.add(ws);
  ws.isAlive = true;
  ws.missedHeartbeats = 0;

  safeSend(ws, {
    type: "config",
    reconnectGraceSeconds,
  });

  chatLogger.userConnected(ws.id);

  if (isReconnect && session.partnerId) {
    const partnerSession = clients.get(session.partnerId);
    const partner = partnerSession?.ws;

    if (partner?.readyState === partner.OPEN) {
      ws.partner = partner;
      partner.partner = ws;
      safeSend(ws, { system: "[SYSTEM] Reconnected to your stranger." });
      safeSend(partner, { system: "[SYSTEM] Stranger reconnected." });
    } else {
      safeSend(ws, {
        system: "[SYSTEM] Stranger connection lost. Reconnecting…",
      });
    }
  } else if (isReconnect && session.waiting) {
    enqueueSession(session, session.queuedPosition ?? waiting.length);
  }

  // Send initial stats to new connection
  safeSend(ws, {
    type: "stats",
    onlineCount: connections.size,
  });

  // Clean up dead connections before pairing
  cleanupWaiting();

  const restoringSession =
    isReconnect && (session.partnerId || session.waiting);
  if (!restoringSession) {
    enqueueSession(session);
  }
  matchWaiting();
  if (session.waiting)
    safeSend(ws, { system: "[SYSTEM] Waiting for a stranger…" });

  // Update stats
  updateConnectionStats();

  ws.on("message", async (data, isBinary) => {
    ws.isAlive = true;
    ws.missedHeartbeats = 0;

    const now = Date.now();
    if (now - ws.rateWindow.start > 1000) {
      ws.rateWindow = { start: now, textCount: 0, eventCount: 0 };
    }

    if (isBinary) {
      handleBinaryChunk(ws, data);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data);
    } catch (error) {
      chatLogger.connectionError(ws.id, new Error("Invalid JSON message"));
      return;
    }

    if (msg.type === "text") {
      ws.rateWindow.textCount++;
      if (ws.rateWindow.textCount > 5) {
        return; // throttle excess text messages
      }
    } else if (msg.type === "reaction" || msg.type === "typing") {
      ws.rateWindow.eventCount++;
      if (ws.rateWindow.eventCount > 8) {
        return; // throttle excess events
      }
    }

    if (msg.type === "endConversation") {
      endConversation(ws);
      return;
    }

    // Application-level keepalive: client sends {type:"ping"} to keep proxy connections alive.
    if (msg.type === "ping") {
      safeSend(ws, { type: "pong" });
      return;
    }

    if (msg.type === "image_start") {
      const { id, messageId, messageIndex, totalChunks, totalBytes } = msg;

      if (
        typeof id !== "string" ||
        !/^[\w-]{1,64}$/.test(id) ||
        !Number.isSafeInteger(totalChunks) ||
        totalChunks < 1 ||
        totalChunks > MAX_IMAGE_CHUNKS ||
        !Number.isSafeInteger(totalBytes) ||
        totalBytes <= 0 ||
        totalBytes > MAX_IMAGE_BYTES
      ) {
        safeSend(ws, {
          type: "image_cancel",
          id: typeof id === "string" ? id : "",
          reason: "invalid",
        });
        return;
      }

      if (!ws.partner || ws.partner.readyState !== ws.partner.OPEN) {
        safeSend(ws, { system: "[SYSTEM] No partner available." });
        return;
      }

      ws.imageTransfers = ws.imageTransfers ?? new Map();
      // Limit concurrent transfers per socket
      if (ws.imageTransfers.size >= 3) {
        safeSend(ws, { type: "image_cancel", id, reason: "too_many" });
        return;
      }

      const timeout = setTimeout(() => {
        if (ws.imageTransfers?.has(id)) {
          ws.imageTransfers.delete(id);
          safeSend(ws, { type: "image_cancel", id, reason: "timeout" });
          if (ws.partner?.readyState === ws.partner?.OPEN) {
            safeSend(ws.partner, {
              type: "image_cancel",
              id,
              reason: "timeout",
            });
          }
        }
      }, 60000);
      timeout.unref();

      ws.imageTransfers.set(id, {
        totalChunks,
        totalBytes,
        chunksRelayed: 0,
        timeout,
      });

      safeSend(ws.partner, {
        type: "image_start",
        id,
        messageId:
          typeof messageId === "string" && messageId.length <= 100
            ? messageId
            : undefined,
        messageIndex: Number.isSafeInteger(messageIndex)
          ? messageIndex
          : undefined,
        totalChunks,
        totalBytes,
      });
      return;
    }

    if (msg.type === "feedback") {
      const feedback = sanitizeTextInput(msg.data, MAX_FEEDBACK_LENGTH);
      const username = sanitizeTextInput(
        msg.username,
        MAX_FEEDBACK_USERNAME_LENGTH,
      );
      if (!feedback) {
        safeSend(ws, {
          type: "feedbackResult",
          ok: false,
          message: `Góp ý phải dài từ 1 đến ${MAX_FEEDBACK_LENGTH} ký tự hợp lệ.`,
        });
        return;
      }

      if (
        (msg.username !== undefined && typeof msg.username !== "string") ||
        username.length > MAX_FEEDBACK_USERNAME_LENGTH
      ) {
        safeSend(ws, {
          type: "feedbackResult",
          ok: false,
          message: `Tên không được vượt quá ${MAX_FEEDBACK_USERNAME_LENGTH} ký tự.`,
        });
        return;
      }

      const remainingCooldown =
        FEEDBACK_COOLDOWN_MS - (Date.now() - (ws.session.lastFeedbackAt ?? 0));
      if (remainingCooldown > 0) {
        safeSend(ws, {
          type: "feedbackResult",
          ok: false,
          message: "Bạn vui lòng chờ một chút trước khi gửi góp ý tiếp theo.",
        });
        return;
      }

      try {
        await appendFeedbackLog({
          timestamp: new Date().toISOString(),
          ...(username ? { username } : {}),
          feedback,
        });
        ws.session.lastFeedbackAt = Date.now();
        safeSend(ws, {
          type: "feedbackResult",
          ok: true,
          message: "Đã gửi góp ý tới admin. Cảm ơn bạn nhé!",
        });
      } catch (error) {
        chatLogger.connectionError(ws.id, error);
        safeSend(ws, {
          type: "feedbackResult",
          ok: false,
          message: "Chưa gửi được góp ý. Bạn thử lại sau nhé.",
        });
      }
      return;
    }

    if (msg.type === "adminFeedback") {
      if (ws.partner?.readyState === ws.partner.OPEN) {
        safeSend(ws.partner, { system: "[SYSTEM] Bên kia đang chửi admin." });
      }
      return;
    }

    if (!ws.partner || ws.partner.readyState !== ws.partner.OPEN) {
      safeSend(ws, { system: "[SYSTEM] No partner available." });
      return;
    }

    // Handle delivery receipts
    if (msg.type === "receipt") {
      safeSend(ws.partner, {
        type: "receipt",
        messageId: msg.messageId,
      });
      return;
    }

    if (msg.type === "reaction") {
      if (
        Number.isSafeInteger(msg.messageIndex) &&
        (msg.author === "self" || msg.author === "peer") &&
        (msg.emoji === null || typeof msg.emoji === "string")
      ) {
        safeSend(ws.partner, {
          type: "reaction",
          messageIndex: msg.messageIndex,
          author: msg.author,
          emoji: msg.emoji,
        });
      }
      return;
    }

    const sanitizedText =
      msg.type === "text"
        ? sanitizeTextInput(msg.data, MAX_TEXT_MESSAGE_LENGTH)
        : null;
    const isTextMessage =
      typeof sanitizedText === "string" && sanitizedText.length > 0;
    const imageBytes =
      msg.type === "image" && typeof msg.data === "string"
        ? decodeImageData(msg.data)
        : null;

    if (msg.type === "image" && !imageBytes) {
      safeSend(ws, {
        system: "[SYSTEM] Image must be a valid JPEG under 5 MB.",
      });
      return;
    }

    if (isTextMessage || imageBytes) {
      const messageId =
        typeof msg.id === "string" && msg.id.length <= 100
          ? msg.id
          : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const recipient = ws.partner;
      const messagePayload = isTextMessage ? sanitizedText : msg.data;
      const messageLength = isTextMessage
        ? Buffer.byteLength(messagePayload, "utf8")
        : imageBytes.length;

      if (ws.partner !== recipient || recipient.readyState !== recipient.OPEN) {
        safeSend(ws, { system: "[SYSTEM] No partner available." });
        return;
      }

      chatLogger.messageSent(ws.id, recipient.id, messageLength);

      safeSend(ws, {
        type: isTextMessage ? "text" : "image",
        data: messagePayload,
        from: "self",
        id: messageId,
        messageIndex: Number.isSafeInteger(msg.messageIndex)
          ? msg.messageIndex
          : undefined,
      });

      safeSend(recipient, {
        type: isTextMessage ? "text" : "image",
        data: messagePayload,
        from: "stranger",
        id: messageId,
        messageIndex: Number.isSafeInteger(msg.messageIndex)
          ? msg.messageIndex
          : undefined,
      });

      if (MESSAGE_LOGGING_ENABLED) {
        appendMessageLog({
          timestamp: new Date().toISOString(),
          fromUuid: ws.session.clientId,
          toUuid: recipient.session.clientId,
          type: isTextMessage ? "text" : "image",
          message: messagePayload,
        }).catch((error) => {
          chatLogger.connectionError(ws.id, error);
        });
      }
    }

    if (msg.type === "typing") {
      chatLogger.typingIndicator(ws.id, ws.partner.id);
      safeSend(ws.partner, { type: "typing" });
    }
  });

  ws.on("pong", () => {
    ws.isAlive = true;
    ws.missedHeartbeats = 0;
  });

  ws.on("close", () => {
    disconnect(ws);
  });

  ws.on("error", (error) => {
    chatLogger.connectionError(ws.id, error);
    disconnect(ws);
  });
});

// Heartbeat mechanism
const heartbeat = setInterval(() => {
  let aliveCount = 0;
  let deadCount = 0;

  connections.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.missedHeartbeats = (ws.missedHeartbeats ?? 0) + 1;
      if (ws.missedHeartbeats >= heartbeatMissedThreshold) {
        deadCount++;
        disconnect(ws);
        ws.terminate();
        return;
      }
    } else {
      ws.missedHeartbeats = 0;
    }

    aliveCount++;
    ws.isAlive = false;
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  });

  chatLogger.heartbeatCheck(aliveCount, deadCount);
}, WS_HEARTBEAT_INTERVAL_MS);

// Cleanup interval
const cleanup = setInterval(() => {
  cleanupWaiting();
}, 60000); // Clean every minute

// Stats broadcast interval
const statsBroadcast = setInterval(() => {
  broadcastStats();
}, 10000); // Broadcast every 10 seconds

function shutdown() {
  if (isShuttingDown) {
    wss.clients.forEach((ws) => ws.terminate());
    return;
  }

  isShuttingDown = true;
  chatLogger.serverStopped();
  clearInterval(heartbeat);
  clearInterval(cleanup);
  clearInterval(statsBroadcast);

  clients.forEach((session) => {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  });
  blockedPairs.forEach((block) => clearTimeout(block.timer));
  blockedPairs.clear();

  server.close();
  wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));

  const forceClose = setTimeout(() => {
    wss.clients.forEach((ws) => ws.terminate());
  }, 5000);
  forceClose.unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

wss.on("close", () => {
  clearInterval(heartbeat);
  clearInterval(cleanup);
  clearInterval(statsBroadcast);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  chatLogger.serverStarted(PORT);
  console.log(`🚀 http://localhost:${PORT}`);
});
