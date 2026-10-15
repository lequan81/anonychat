import { v4 as uuid } from "uuid";
import chatLogger from "../logging/logger.js";
import {
  getClientIp,
  isOriginAllowed,
  checkWsRateLimit,
  registerWsConnection,
} from "../services/rateLimiter.js";
import {
  safeSend,
  cleanupWaiting,
  matchWaiting,
  enqueueSession,
  disconnectSession,
  broadcastStats,
  updateConnectionStats,
  getConnections,
  getClients,
  getWaiting,
} from "../services/matchmaker.js";
import { handleSocketMessage } from "./messageHandler.js";
import {
  RECONNECT_GRACE_SECONDS,
  WS_HEARTBEAT_INTERVAL_MS,
  WS_HEARTBEAT_MISSED_THRESHOLD,
} from "../config/index.js";

const CLIENT_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function setupWebSocketServer(wss, isShuttingDownGetter = () => false) {
  const connections = getConnections();
  const clients = getClients();
  const waiting = getWaiting();

  wss.on("connection", (ws, request) => {
    const clientIp = getClientIp(request);

    if (!isOriginAllowed(request.headers.origin, request.headers.host)) {
      chatLogger.connectionError(
        "ws-origin",
        new Error(
          `Origin not allowed: ${request.headers.origin} from IP ${clientIp}`
        )
      );
      ws.close(1008, "Origin not allowed");
      return;
    }

    const rateCheck = checkWsRateLimit(clientIp);
    if (!rateCheck.allowed) {
      chatLogger.connectionError(
        rateCheck.logEvent,
        new Error(rateCheck.error)
      );
      ws.close(1008, rateCheck.reason);
      return;
    }

    registerWsConnection(clientIp, ws);
    ws.clientIp = clientIp;
    ws.rateWindow = { start: Date.now(), textCount: 0, eventCount: 0 };

    const clientId = new URL(
      request.url,
      "http://localhost"
    ).searchParams.get("clientId");

    if (!clientId || !CLIENT_ID_REGEX.test(clientId)) {
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
        chatLogger.userDisconnected(
          previousSocket.id,
          "replaced_connection"
        );

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
      reconnectGraceSeconds: RECONNECT_GRACE_SECONDS,
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
    if (session.waiting) {
      safeSend(ws, { system: "[SYSTEM] Waiting for a stranger…" });
    }

    // Update stats
    updateConnectionStats();

    ws.on("message", (data, isBinary) => {
      handleSocketMessage(ws, data, isBinary);
    });

    ws.on("pong", () => {
      ws.isAlive = true;
      ws.missedHeartbeats = 0;
    });

    ws.on("close", () => {
      disconnectSession(ws, isShuttingDownGetter());
    });

    ws.on("error", (error) => {
      chatLogger.connectionError(ws.id, error);
      disconnectSession(ws, isShuttingDownGetter());
    });
  });

  // Heartbeat mechanism
  const heartbeat = setInterval(() => {
    let aliveCount = 0;
    let deadCount = 0;

    connections.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.missedHeartbeats = (ws.missedHeartbeats ?? 0) + 1;
        if (ws.missedHeartbeats >= WS_HEARTBEAT_MISSED_THRESHOLD) {
          deadCount++;
          disconnectSession(ws, isShuttingDownGetter());
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

  return () => {
    clearInterval(heartbeat);
    clearInterval(cleanup);
    clearInterval(statsBroadcast);
  };
}
