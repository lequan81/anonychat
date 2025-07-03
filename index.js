// server.js
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const app = express();
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocketServer({ server });

const waiting = [];

function pair(a, b) {
  a.partner = b;
  b.partner = a;
}

wss.on('connection', (ws) => {
  if (waiting.length) {
    const idx = Math.floor(Math.random() * waiting.length);
    const other = waiting.splice(idx, 1)[0];
    pair(ws, other);
    [ws, other].forEach(s => s.send(JSON.stringify({ system: '[SYSTEM] Connected to a stranger.' })));
  } else {
    waiting.push(ws);
    ws.send(JSON.stringify({ system: '[SYSTEM] Waiting for a stranger…' }));
  }

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (!ws.partner || ws.partner.readyState !== ws.OPEN) {
      ws.send(JSON.stringify({ system: 'No partner.' }));
      return;
    }

    if (msg.type === 'text') {
      // Send to both users
      ws.send(JSON.stringify({ type: 'text', data: msg.data, from: 'self' }));
      ws.partner.send(JSON.stringify({ type: 'text', data: msg.data, from: 'stranger' }));
    }

    if (msg.type === 'typing') {
      ws.partner.send(JSON.stringify({ type: 'typing' }));
    }
  });

  ws.on('close', () => {
    if (ws.partner && ws.partner.readyState === ws.OPEN) {
      ws.partner.send(JSON.stringify({ system: '[SYSTEM] Stranger disconnected.' }));
      ws.partner.partner = null;
      waiting.push(ws.partner);
    } else {
      const i = waiting.indexOf(ws);
      if (i >= 0) waiting.splice(i, 1);
    }
  });
});

server.listen(process.env.PORT || 3000, () => console.log('🚀 http://localhost:3000'));
