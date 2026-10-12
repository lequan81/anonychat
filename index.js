import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import chatLogger from './logger.js';

const app = express();
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const waiting = [];
const connections = new Set();
const clients = new Map();
const RECONNECT_GRACE_MS = 60000;

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

        if (!waiting.includes(partner)) {
          waiting.push(partner);
          partnerSession.waiting = true;
          chatLogger.userWaiting(partner.id);
          safeSend(partner, { system: '[SYSTEM] Waiting for a stranger…' });
        }
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
      safeSend(partner, { system: '[SYSTEM] Stranger connection lost. Reconnecting…' });
    }
  }

  clearTimeout(session.reconnectTimer);
  session.reconnectTimer = setTimeout(() => expireSession(session), RECONNECT_GRACE_MS);
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

wss.on('connection', (ws, request) => {
  const clientId = new URL(request.url, 'http://localhost').searchParams.get('clientId');
  if (!clientId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    ws.close(1008, 'A valid clientId is required');
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

  chatLogger.userConnected(ws.id);

  if (isReconnect && session.partnerId) {
    const partnerSession = clients.get(session.partnerId);
    const partner = partnerSession?.ws;

    if (partner?.readyState === partner.OPEN) {
      ws.partner = partner;
      partner.partner = ws;
      safeSend(ws, { system: '[SYSTEM] Reconnected to your stranger.' });
      safeSend(partner, { system: '[SYSTEM] Stranger reconnected.' });
    } else {
      safeSend(ws, { system: '[SYSTEM] Stranger connection lost. Reconnecting…' });
    }
  } else if (isReconnect && session.waiting) {
    enqueueSession(session, session.queuedPosition ?? waiting.length);
    safeSend(ws, { system: '[SYSTEM] Waiting for a stranger…' });
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
    if (waiting.length > 0) {
      // Find a valid waiting connection
      let other = null;
      let attempts = 0;

      while (waiting.length > 0 && attempts < waiting.length) {
        const idx = Math.floor(Math.random() * waiting.length);
        const candidate = waiting[idx];

        if (candidate.readyState === candidate.OPEN && !candidate.partner) {
          other = waiting.splice(idx, 1)[0];
          break;
        } else {
          // Remove dead connection
          waiting.splice(idx, 1);
        }
        attempts++;
      }

      if (other && pair(ws, other)) {
        safeSend(ws, { system: '[SYSTEM] Connected to a stranger.' });
        safeSend(other, { system: '[SYSTEM] Connected to a stranger.' });
      } else {
        enqueueSession(session);
        safeSend(ws, { system: '[SYSTEM] Waiting for a stranger…' });
      }
    } else {
      if (!session.waiting) {
        enqueueSession(session);
        safeSend(ws, { system: '[SYSTEM] Waiting for a stranger…' });
      }
    }
  }

  // Update stats
  updateConnectionStats();

  ws.on('message', (data) => {
    ws.isAlive = true;

    let msg;
    try {
      msg = JSON.parse(data);
    } catch (error) {
      chatLogger.connectionError(ws.id, new Error('Invalid JSON message'));
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

    if (msg.type === 'text' && msg.data) {
      const messageId = msg.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      chatLogger.messageSent(ws.id, ws.partner.id, msg.data.length);
      
      // Send to sender with message ID
      safeSend(ws, { 
        type: 'text', 
        data: msg.data, 
        from: 'self',
        id: messageId
      });
      
      // Send to partner with message ID
      safeSend(ws.partner, { 
        type: 'text', 
        data: msg.data, 
        from: 'stranger',
        id: messageId
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

// Graceful shutdown
process.on('SIGTERM', () => {
  chatLogger.serverStopped();
  clearInterval(heartbeat);
  clearInterval(cleanup);
  clearInterval(statsBroadcast);
  server.close();
});

process.on('SIGINT', () => {
  chatLogger.serverStopped();
  clearInterval(heartbeat);
  clearInterval(cleanup);
  clearInterval(statsBroadcast);
  server.close();
});

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
