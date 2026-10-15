import chatLogger from "../logging/logger.js";
import {
  PAIR_REMATCH_COOLDOWN_MS,
  RECONNECT_GRACE_MS,
  RECONNECT_GRACE_SECONDS,
} from "../config/index.js";
import { removeWsConnection } from "./rateLimiter.js";

// Core state
const waiting = [];
const connections = new Set();
const clients = new Map(); // clientId -> session
const blockedPairs = new Map(); // pairKey -> { expiresAt, timer }

export function getOnlineCount() {
  return connections.size;
}

export function getWaitingCount() {
  return waiting.length;
}

export function getActivePairsCount() {
  return Math.floor((connections.size - waiting.length) / 2);
}

export function getConnections() {
  return connections;
}

export function getClients() {
  return clients;
}

export function getWaiting() {
  return waiting;
}

export function safeSend(ws, data) {
  if (ws && ws.readyState === ws.OPEN) {
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

export function broadcastStats() {
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

export function updateConnectionStats() {
  chatLogger.updateStats({
    currentConnections: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2),
  });
  broadcastStats();
}

export function cleanupWaiting() {
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

export function pair(a, b) {
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

export function pairKey(clientIdA, clientIdB) {
  return [clientIdA, clientIdB].sort().join(":");
}

export function isPairBlocked(clientIdA, clientIdB) {
  const key = pairKey(clientIdA, clientIdB);
  const block = blockedPairs.get(key);
  if (!block) return false;
  if (block.expiresAt > Date.now()) return true;

  clearTimeout(block.timer);
  blockedPairs.delete(key);
  return false;
}

export function blockPair(clientIdA, clientIdB) {
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

export function matchWaiting() {
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

export function enqueueSession(session, position = waiting.length) {
  const ws = session.ws;
  if (!ws || ws.readyState !== ws.OPEN || waiting.includes(ws)) return;

  waiting.splice(Math.min(position, waiting.length), 0, ws);
  session.waiting = true;
  session.queuedPosition = null;
  chatLogger.userWaiting(ws.id);
}

export function expireSession(session, isShuttingDown = false) {
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
          "reconnect_timeout"
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

export function disconnectSession(ws, isShuttingDown = false) {
  if (ws.clientIp) {
    removeWsConnection(ws.clientIp, ws);
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
        reconnectSeconds: RECONNECT_GRACE_SECONDS,
      });
    }
  }

  clearTimeout(session.reconnectTimer);
  session.reconnectTimer = isShuttingDown
    ? null
    : setTimeout(
        () => expireSession(session, isShuttingDown),
        RECONNECT_GRACE_MS
      );
  updateConnectionStats();
}

export function endConversation(ws) {
  const session = ws.session;
  const partnerSession = session?.partnerId
    ? clients.get(session.partnerId)
    : null;
  if (!session || !partnerSession) return;

  const partner = partnerSession.ws;
  const partnerIsConnected = Boolean(
    partner && partner.readyState === partner.OPEN
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
    "ended_by_user"
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

export function cleanupOnShutdown() {
  clients.forEach((session) => {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  });
  blockedPairs.forEach((block) => clearTimeout(block.timer));
  blockedPairs.clear();
}
