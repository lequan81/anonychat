// logger.js
import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create logs directory if it doesn't exist
import fs from "fs";
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: "info",
  format: customFormat,
  transports: [
    // General application logs
    new winston.transports.File({
      filename: path.join(logsDir, "app.log"),
      maxsize: parseInt(process.env.LOG_APP_MAX_SIZE, 10) || 10 * 1024 * 1024, // 10MB
      maxFiles: parseInt(process.env.LOG_APP_MAX_FILES, 10) || 5,
      tailable: true,
    }),

    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: parseInt(process.env.LOG_ERROR_MAX_SIZE, 10) || 10 * 1024 * 1024,
      maxFiles: parseInt(process.env.LOG_ERROR_MAX_FILES, 10) || 3,
      tailable: true,
    }),

    // Metrics logs (separate file for analytics)
    new winston.transports.File({
      filename: path.join(logsDir, "metrics.log"),
      level: "info",
      maxsize: parseInt(process.env.LOG_METRICS_MAX_SIZE, 10) || 50 * 1024 * 1024, // 50MB for metrics
      maxFiles: parseInt(process.env.LOG_METRICS_MAX_FILES, 10) || 10,
      tailable: true,
    }),

    // Console output for development
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

// Chat-specific logging functions
class ChatLogger {
  constructor(baseLogger) {
    this.logger = baseLogger;
    this.stats = {
      totalConnections: 0,
      currentConnections: 0,
      waitingUsers: 0,
      activePairs: 0,
      messagesSent: 0,
      errors: 0,
    };

    // Log stats every 5 minutes
    this.metricsInterval = setInterval(() => {
      this.logMetrics();
    }, parseInt(process.env.LOG_METRICS_INTERVAL, 10) || 5 * 60 * 1000);
  }

  // Connection events
  userConnected(connectionId) {
    this.stats.totalConnections++;
    this.stats.currentConnections++;

    this.logger.info("User connected", {
      event: "user_connected",
      connectionId,
      currentConnections: this.stats.currentConnections,
      waitingUsers: this.stats.waitingUsers,
      timestamp: new Date().toISOString(),
    });
  }

  userDisconnected(connectionId, reason = "unknown") {
    this.stats.currentConnections--;

    this.logger.info("User disconnected", {
      event: "user_disconnected",
      connectionId,
      reason,
      currentConnections: this.stats.currentConnections,
      waitingUsers: this.stats.waitingUsers,
      timestamp: new Date().toISOString(),
    });
  }

  // Pairing events
  usersPaired(user1Id, user2Id) {
    this.stats.activePairs++;
    this.stats.waitingUsers = Math.max(0, this.stats.waitingUsers - 2);

    this.logger.info("Users paired", {
      event: "users_paired",
      user1Id,
      user2Id,
      activePairs: this.stats.activePairs,
      waitingUsers: this.stats.waitingUsers,
      timestamp: new Date().toISOString(),
    });
  }

  userWaiting(connectionId) {
    this.stats.waitingUsers++;

    this.logger.info("User waiting", {
      event: "user_waiting",
      connectionId,
      waitingUsers: this.stats.waitingUsers,
      timestamp: new Date().toISOString(),
    });
  }

  pairDisconnected(user1Id, user2Id, reason = "unknown") {
    this.stats.activePairs--;

    this.logger.info("Pair disconnected", {
      event: "pair_disconnected",
      user1Id,
      user2Id,
      reason,
      activePairs: this.stats.activePairs,
      timestamp: new Date().toISOString(),
    });
  }

  // Message events
  messageSent(fromId, toId, messageLength) {
    this.stats.messagesSent++;

    this.logger.info("Message sent", {
      event: "message_sent",
      fromId,
      toId,
      messageLength,
      totalMessages: this.stats.messagesSent,
      timestamp: new Date().toISOString(),
    });
  }

  typingIndicator(fromId, toId) {
    this.logger.debug("Typing indicator", {
      event: "typing_indicator",
      fromId,
      toId,
      timestamp: new Date().toISOString(),
    });
  }

  // Error events
  connectionError(connectionId, error) {
    this.stats.errors++;

    this.logger.error("Connection error", {
      event: "connection_error",
      connectionId,
      error: error.message,
      stack: error.stack,
      totalErrors: this.stats.errors,
      timestamp: new Date().toISOString(),
    });
  }

  pairingError(error, waitingCount) {
    this.stats.errors++;

    this.logger.error("Pairing error", {
      event: "pairing_error",
      error: error.message,
      waitingCount,
      totalErrors: this.stats.errors,
      timestamp: new Date().toISOString(),
    });
  }

  // System events
  serverStarted(port) {
    this.logger.info("Server started", {
      event: "server_started",
      port,
      timestamp: new Date().toISOString(),
    });
  }

  serverStopped() {
    this.logger.info("Server stopped", {
      event: "server_stopped",
      finalStats: this.stats,
      timestamp: new Date().toISOString(),
    });

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
  }

  // Cleanup events
  cleanupPerformed(removedConnections) {
    this.logger.info("Cleanup performed", {
      event: "cleanup_performed",
      removedConnections,
      currentConnections: this.stats.currentConnections,
      waitingUsers: this.stats.waitingUsers,
      timestamp: new Date().toISOString(),
    });
  }

  heartbeatCheck(aliveConnections, deadConnections) {
    this.logger.debug("Heartbeat check", {
      event: "heartbeat_check",
      aliveConnections,
      deadConnections,
      timestamp: new Date().toISOString(),
    });
  }

  // No partner timeout event
  noPartnerTimeout(connectionId) {
    this.logger.info("No partner timeout", {
      event: "no_partner_timeout",
      connectionId,
      currentConnections: this.stats.currentConnections,
      waitingUsers: this.stats.waitingUsers,
      timestamp: new Date().toISOString(),
    });
  }

  // Inactive pair cleanup event
  inactivePairCleanup(user1Id, user2Id, inactiveTime) {
    this.stats.activePairs = Math.max(0, this.stats.activePairs - 1);

    this.logger.info("Inactive pair cleanup", {
      event: "inactive_pair_cleanup",
      user1Id,
      user2Id,
      inactiveTime,
      inactiveDays: Math.floor(inactiveTime / (24 * 60 * 60 * 1000)),
      activePairs: this.stats.activePairs,
      timestamp: new Date().toISOString(),
    });
  }

  // General log method
  log(message, level = "info") {
    this.logger.log(level, message, {
      timestamp: new Date().toISOString(),
    });
  }

  // Metrics logging
  logMetrics() {
    const metrics = {
      event: "metrics_snapshot",
      timestamp: new Date().toISOString(),
      stats: { ...this.stats },
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };

    this.logger.info("Metrics snapshot", metrics);
  }

  // Update stats manually
  updateStats(newStats) {
    Object.assign(this.stats, newStats);
  }

  // Get current stats
  getStats() {
    return { ...this.stats };
  }
}

// Export logger instance
const chatLogger = new ChatLogger(logger);

export default chatLogger;
export { logger, ChatLogger };
