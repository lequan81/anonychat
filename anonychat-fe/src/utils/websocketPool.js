// WebSocket connection pool for better resource management
class WebSocketPool {
  constructor() {
    this.connections = new Map();
    this.maxConnections = 1; // For this app, we only need 1 connection
  }

  getConnection(url, options = {}) {
    const key = `${url}-${JSON.stringify(options)}`;

    if (this.connections.has(key)) {
      const connection = this.connections.get(key);
      if (connection.readyState === WebSocket.OPEN || connection.readyState === WebSocket.CONNECTING) {
        return connection;
      } else {
        this.connections.delete(key);
      }
    }

    // Create new connection if none exists or existing is closed
    const ws = new WebSocket(url);
    this.connections.set(key, ws);

    // Cleanup on close
    ws.addEventListener('close', () => {
      this.connections.delete(key);
    });

    return ws;
  }

  closeAll() {
    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.connections.clear();
  }
}

// Singleton instance
export const wsPool = new WebSocketPool();

// Connection states enum for better type safety
export const CONNECTION_STATES = Object.freeze({
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
});

// WebSocket event types
export const WS_EVENTS = Object.freeze({
  OPEN: 'open',
  CLOSE: 'close',
  ERROR: 'error',
  MESSAGE: 'message',
});
