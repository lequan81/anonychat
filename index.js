import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import chatLogger from './logger.js';
import { appendMessageLog } from './messageLog.js';

const app = express();
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 7 * 1024 * 1024 });

const waiting = [];
const connections = new Set();
const clients = new Map();
const blockedPairs = new Map();
let isShuttingDown = false;
const reconnectGraceSeconds = Number(process.env.RECONNECT_GRACE_SECONDS ?? 30);
const pairRematchCooldownSeconds = Number(process.env.PAIR_REMATCH_COOLDOWN_SECONDS ?? 15);
const messageLoggingSetting = (process.env.MESSAGE_LOGGING_ENABLED ?? 'true').toLowerCase();
if (!Number.isInteger(reconnectGraceSeconds) || reconnectGraceSeconds <= 0) {
  throw new Error('RECONNECT_GRACE_SECONDS must be a positive integer');
}
if (!Number.isInteger(pairRematchCooldownSeconds) || pairRematchCooldownSeconds <= 0) {
  throw new Error('PAIR_REMATCH_COOLDOWN_SECONDS must be a positive integer');
}
if (messageLoggingSetting !== 'true' && messageLoggingSetting !== 'false') {
  throw new Error('MESSAGE_LOGGING_ENABLED must be true or false');
}
const RECONNECT_GRACE_MS = reconnectGraceSeconds * 1000;
const PAIR_REMATCH_COOLDOWN_MS = pairRematchCooldownSeconds * 1000;
const MESSAGE_LOGGING_ENABLED = messageLoggingSetting === 'true';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function decodeImageData(data) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[1].length % 4 !== 0) {
    return null;
  }

  const imageBytes = Buffer.from(match[1], 'base64');
  if (
    imageBytes.length === 0
    || imageBytes.length > MAX_IMAGE_BYTES
    || imageBytes.toString('base64') !== match[1]
    || imageBytes[0] !== 0xff
    || imageBytes[1] !== 0xd8
    || imageBytes[2] !== 0xff
  ) {
    return null;
  }

  return imageBytes;
}

function broadcastStats() {
  const stats = {
    type: 'stats',
    onlineCount: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2)
  };

  connections.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(stats));
      } catch (error) {
        console.log('Error broadcasting stats:', error);
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
  return [clientIdA, clientIdB].sort().join(':');
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
        b.readyState === b.OPEN
        && !b.partner
        && !isPairBlocked(a.session.clientId, b.session.clientId)
      ) {
        candidates.push(j);
      }
    }
    if (candidates.length === 0) continue;

    const secondIndex = candidates[Math.floor(Math.random() * candidates.length)];
    const b = waiting.splice(secondIndex, 1)[0];
    waiting.splice(i, 1);
    if (!pair(a, b)) {
      i--;
      continue;
    }

    safeSend(a, { type: 'peer', uuidPrefix: b.session.clientId.slice(0, 4) });
    safeSend(b, { type: 'peer', uuidPrefix: a.session.clientId.slice(0, 4) });
    safeSend(a, { system: '[SYSTEM] Connected to a stranger.' });
    safeSend(b, { system: '[SYSTEM] Connected to a stranger.' });
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
    activePairs: Math.floor((connections.size - waiting.length) / 2)
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
        safeSend(partner, { system: '[SYSTEM] Stranger disconnected.' });
        chatLogger.pairDisconnected(session.clientId, partnerSession.clientId, 'reconnect_timeout');

        if (!partnerSession.waiting) {
          enqueueSession(partnerSession);
          safeSend(partner, { system: '[SYSTEM] Waiting for a stranger…' });
        }
        matchWaiting();
      }
    }
  }

  updateConnectionStats();
}

function disconnect(ws) {
  const session = ws.session;
  connections.delete(ws);

  // A replaced socket must not disconnect the newer socket for this client.
  if (!session || session.ws !== ws) return;

  session.ws = null;
  chatLogger.userDisconnected(ws.id, 'connection_lost');

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
        system: '[SYSTEM] Stranger connection lost. Reconnecting…',
        reconnectSeconds: reconnectGraceSeconds
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
  const partner = ws.partner;
  if (!partner || partner.readyState !== partner.OPEN) return;

  const session = ws.session;
  const partnerSession = partner.session;
  if (!session || !partnerSession) return;

  blockPair(session.clientId, partnerSession.clientId);
  ws.partner = null;
  partner.partner = null;
  session.partnerId = null;
  partnerSession.partnerId = null;

  for (const currentSession of [session, partnerSession]) {
    clearTimeout(currentSession.reconnectTimer);
    currentSession.reconnectTimer = null;
    currentSession.waiting = false;
    currentSession.queuedPosition = null;
  }

  chatLogger.pairDisconnected(session.clientId, partnerSession.clientId, 'ended_by_user');
  safeSend(ws, { system: '[SYSTEM] Conversation ended. Finding a new stranger…' });
  safeSend(partner, { system: '[SYSTEM] Conversation ended. Finding a new stranger…' });

  enqueueSession(session);
  enqueueSession(partnerSession);
  matchWaiting();

  if (session.waiting) safeSend(ws, { system: '[SYSTEM] Waiting for a stranger…' });
  if (partnerSession.waiting) safeSend(partner, { system: '[SYSTEM] Waiting for a stranger…' });
  updateConnectionStats();
}

wss.on('connection', (ws, request) => {
  const clientId = new URL(request.url, 'http://localhost').searchParams.get('clientId');
  if (!clientId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    ws.close(1008, 'A valid clientId is required');
    return;
  }

  ws.id = uuid();
  let session = clients.get(clientId);
  const isReconnect = Boolean(session);

  if (session?.ws && (session.ws.readyState === session.ws.OPEN || session.ws.readyState === session.ws.CONNECTING)) {
    ws.close(4001, 'Client already connected');
    return;
  }

  if (session) {
    clearTimeout(session.reconnectTimer);

    if (session.ws) {
      const previousSocket = session.ws;
      connections.delete(previousSocket);
      chatLogger.userDisconnected(previousSocket.id, 'replaced_connection');

      const previousWaitingIndex = waiting.indexOf(previousSocket);
      if (previousWaitingIndex >= 0) {
        waiting.splice(previousWaitingIndex, 1);
        session.queuedPosition = previousWaitingIndex;
      }

      previousSocket.close(4001, 'Reconnected from this client');
    }
  } else {
    session = {
      clientId,
      ws: null,
      partnerId: null,
      reconnectTimer: null,
      waiting: false,
      queuedPosition: null
    };
    clients.set(clientId, session);
  }

  session.ws = ws;
  ws.session = session;
  connections.add(ws);
  ws.isAlive = true;

  safeSend(ws, {
    type: 'config',
    reconnectGraceSeconds
  });

  chatLogger.userConnected(ws.id);

  if (isReconnect && session.partnerId) {
    const partnerSession = clients.get(session.partnerId);
    const partner = partnerSession?.ws;

    if (partner?.readyState === partner.OPEN) {
      ws.partner = partner;
      partner.partner = ws;
      safeSend(ws, { type: 'peer', uuidPrefix: partnerSession.clientId.slice(0, 4) });
      safeSend(partner, { type: 'peer', uuidPrefix: session.clientId.slice(0, 4) });
      safeSend(ws, { system: '[SYSTEM] Reconnected to your stranger.' });
      safeSend(partner, { system: '[SYSTEM] Stranger reconnected.' });
    } else {
      safeSend(ws, { type: 'peer', uuidPrefix: partnerSession.clientId.slice(0, 4) });
      safeSend(ws, { system: '[SYSTEM] Stranger connection lost. Reconnecting…' });
    }
  } else if (isReconnect && session.waiting) {
    enqueueSession(session, session.queuedPosition ?? waiting.length);
  }

  // Send initial stats to new connection
  safeSend(ws, {
    type: 'stats',
    onlineCount: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2)
  });

  // Clean up dead connections before pairing
  cleanupWaiting();

  const restoringSession = isReconnect && (session.partnerId || session.waiting);
  if (!restoringSession) {
    enqueueSession(session);
  }
  matchWaiting();
  if (session.waiting) safeSend(ws, { system: '[SYSTEM] Waiting for a stranger…' });

  // Update stats
  updateConnectionStats();

  ws.on('message', async (data) => {
    ws.isAlive = true;

    let msg;
    try {
      msg = JSON.parse(data);
    } catch (error) {
      chatLogger.connectionError(ws.id, new Error('Invalid JSON message'));
      return;
    }

    if (msg.type === 'endConversation') {
      endConversation(ws);
      return;
    }

    if (!ws.partner || ws.partner.readyState !== ws.partner.OPEN) {
      safeSend(ws, { system: '[SYSTEM] No partner available.' });
      return;
    }

    // Handle delivery receipts
    if (msg.type === 'receipt') {
      safeSend(ws.partner, {
        type: 'receipt',
        messageId: msg.messageId
      });
      return;
    }

    if (msg.type === 'reaction') {
      if (
        Number.isSafeInteger(msg.messageIndex)
        && (msg.author === 'self' || msg.author === 'peer')
        && (msg.emoji === null || typeof msg.emoji === 'string')
      ) {
        safeSend(ws.partner, {
          type: 'reaction',
          messageIndex: msg.messageIndex,
          author: msg.author,
          emoji: msg.emoji
        });
      }
      return;
    }

    const isTextMessage = msg.type === 'text' && typeof msg.data === 'string' && msg.data.trim().length > 0;
    const imageBytes = msg.type === 'image' && typeof msg.data === 'string'
      ? decodeImageData(msg.data)
      : null;

    if (msg.type === 'image' && !imageBytes) {
      safeSend(ws, { system: '[SYSTEM] Image must be a valid JPEG under 5 MB.' });
      return;
    }

    if (isTextMessage || imageBytes) {
      const messageId = typeof msg.id === 'string' && msg.id.length <= 100
        ? msg.id
        : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const recipient = ws.partner;
      const messageLength = isTextMessage ? Buffer.byteLength(msg.data, 'utf8') : imageBytes.length;

      if (MESSAGE_LOGGING_ENABLED) {
        try {
          await appendMessageLog({
            timestamp: new Date().toISOString(),
            fromUuid: ws.session.clientId,
            toUuid: recipient.session.clientId,
            type: isTextMessage ? 'text' : 'image',
            message: msg.data
          });
        } catch (error) {
          chatLogger.connectionError(ws.id, error);
          safeSend(ws, { system: '[SYSTEM] Message could not be saved. It was not sent.' });
          return;
        }
      }

      if (ws.partner !== recipient || recipient.readyState !== recipient.OPEN) {
        safeSend(ws, { system: '[SYSTEM] No partner available.' });
        return;
      }

      chatLogger.messageSent(ws.id, recipient.id, messageLength);

      safeSend(ws, {
        type: isTextMessage ? 'text' : 'image',
        data: msg.data,
        from: 'self',
        id: messageId,
        messageIndex: Number.isSafeInteger(msg.messageIndex) ? msg.messageIndex : undefined
      });

      safeSend(recipient, {
        type: isTextMessage ? 'text' : 'image',
        data: msg.data,
        from: 'stranger',
        id: messageId,
        messageIndex: Number.isSafeInteger(msg.messageIndex) ? msg.messageIndex : undefined
      });
    }

    if (msg.type === 'typing') {
      chatLogger.typingIndicator(ws.id, ws.partner.id);
      safeSend(ws.partner, { type: 'typing' });
    }
  });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('close', () => {
    disconnect(ws);
  });

  ws.on('error', (error) => {
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
      deadCount++;
      disconnect(ws);
      ws.terminate();
      return;
    }

    aliveCount++;
    ws.isAlive = false;
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  });

  chatLogger.heartbeatCheck(aliveCount, deadCount);
}, 30000); // Check every 30 seconds

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
  wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));

  const forceClose = setTimeout(() => {
    wss.clients.forEach((ws) => ws.terminate());
  }, 5000);
  forceClose.unref();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

wss.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(cleanup);
  clearInterval(statsBroadcast);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  chatLogger.serverStarted(PORT);
  console.log(`🚀 http://localhost:${PORT}`);
});
