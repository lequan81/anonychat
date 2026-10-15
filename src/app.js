import express from "express";
import path from "node:path";
import { PUBLIC_DIRECTORY } from "./config/index.js";
import adminRouter from "./routes/admin.js";

const app = express();
let isShuttingDown = false;

export function setShuttingDown(status) {
  isShuttingDown = Boolean(status);
}

export function isAppShuttingDown() {
  return isShuttingDown;
}

// Security headers
app.use((request, response, next) => {
  response.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
});

app.use(express.json({ limit: "16kb" }));
app.use(express.static(PUBLIC_DIRECTORY));

// Admin routes with no-store cache control
app.use(
  "/api/admin",
  (request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  },
  adminRouter
);

// Health check endpoint
app.get("/healthz", (request, response) => {
  response
    .status(isShuttingDown ? 503 : 200)
    .type("text/plain")
    .send(isShuttingDown ? "shutting down" : "ok");
});

// Admin SPA direct routing
app.get("/admin", (request, response) => {
  response.sendFile(path.join(PUBLIC_DIRECTORY, "index.html"));
});

export default app;
