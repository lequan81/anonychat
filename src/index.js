import { createServer } from "http";
import { WebSocketServer } from "ws";
import app, { setShuttingDown, isAppShuttingDown } from "./app.js";
import { PORT, WS_MAX_PAYLOAD } from "./config/index.js";
import chatLogger from "./logging/logger.js";
import { setupWebSocketServer } from "./ws/connectionHandler.js";
import { cleanupOnShutdown } from "./services/matchmaker.js";

const server = createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: WS_MAX_PAYLOAD,
});

const cleanupIntervals = setupWebSocketServer(wss, isAppShuttingDown);

function shutdown() {
  if (isAppShuttingDown()) {
    wss.clients.forEach((ws) => ws.terminate());
    return;
  }

  setShuttingDown(true);
  chatLogger.serverStopped();
  cleanupIntervals();
  cleanupOnShutdown();

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
  cleanupIntervals();
});

server.listen(PORT, () => {
  chatLogger.serverStarted(PORT);
  console.log(`🚀 http://localhost:${PORT}`);
});

export { server, wss };
