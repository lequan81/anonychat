import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import chatLogger from './logger.js';

const app = express();
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocketServer({ server });

const waiting = [];
const connections = new Set();

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

function disconnect(ws) {
  connections.delete(ws);
  chatLogger.userDisconnected(ws.id, 'normal_disconnect');

  // Remove from waiting if present
  const waitingIndex = waiting.indexOf(ws);
  if (waitingIndex >= 0) {
    waiting.splice(waitingIndex, 1);
    chatLogger.updateStats({ waitingUsers: waiting.length });
  }

  // Handle partner
  if (ws.partner && ws.partner.readyState === ws.partner.OPEN) {
    safeSend(ws.partner, { system: '[SYSTEM] Stranger disconnected.' });
    chatLogger.pairDisconnected(ws.id, ws.partner.id, 'partner_disconnect');

    ws.partner.partner = null;

    // Only add to waiting if not already there
    if (!waiting.includes(ws.partner)) {
      waiting.push(ws.partner);
      chatLogger.userWaiting(ws.partner.id);
      safeSend(ws.partner, { system: '[SYSTEM] Waiting for a stranger…' });
    }
  }

  // Update stats
  chatLogger.updateStats({
    currentConnections: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2)
  });

  // Broadcast updated stats
  broadcastStats();
}

wss.on('connection', (ws) => {
  ws.id = uuid();
  connections.add(ws);
  ws.isAlive = true;

  chatLogger.userConnected(ws.id);

  // Send initial stats to new connection
  safeSend(ws, {
    type: 'stats',
    onlineCount: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2)
  });

  // Clean up dead connections before pairing
  cleanupWaiting();

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
      waiting.push(ws);
      chatLogger.userWaiting(ws.id);
      safeSend(ws, { system: '[SYSTEM] Waiting for a stranger…' });
    }
  } else {
    waiting.push(ws);
    chatLogger.userWaiting(ws.id);
    safeSend(ws, { system: '[SYSTEM] Waiting for a stranger…' });
  }

  // Update stats
  chatLogger.updateStats({
    currentConnections: connections.size,
    waitingUsers: waiting.length,
    activePairs: Math.floor((connections.size - waiting.length) / 2)
  });

  // Broadcast updated stats
  broadcastStats();

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
