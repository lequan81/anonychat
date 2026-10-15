import {
  ALLOWED_ORIGINS,
  MAX_CONCURRENT_WS_PER_IP,
  MAX_WS_CONNECTS_PER_MINUTE,
  MAX_ADMIN_LOGIN_ATTEMPTS,
  ADMIN_LOCK_DURATION_MS,
} from "../config/index.js";

// WebSocket connection tracking
const wsConnectionsByIp = new Map(); // ip -> Set<ws>
const wsConnectTimestampsByIp = new Map(); // ip -> number[]

// Admin login brute-force tracking
const failedAdminLogins = new Map(); // ip -> { count: number, lockedUntil: number }

export function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress || "unknown";
}

export function isOriginAllowed(origin, host) {
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    if (
      originUrl.host === host ||
      originUrl.hostname === "localhost" ||
      originUrl.hostname === "127.0.0.1"
    ) {
      return true;
    }
    if (ALLOWED_ORIGINS) {
      const allowed = ALLOWED_ORIGINS.split(",").map((o) =>
        o.trim().toLowerCase()
      );
      if (
        allowed.includes(origin.toLowerCase()) ||
        allowed.includes(originUrl.origin.toLowerCase())
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function checkWsRateLimit(clientIp) {
  const now = Date.now();
  let timestamps = wsConnectTimestampsByIp.get(clientIp) || [];
  timestamps = timestamps.filter((t) => now - t < 60000);
  wsConnectTimestampsByIp.set(clientIp, timestamps);

  if (timestamps.length >= MAX_WS_CONNECTS_PER_MINUTE) {
    return {
      allowed: false,
      reason: "Too many connections, please wait a moment",
      logEvent: "ws-rate-limit",
      error: `Connection rate limit reached for IP ${clientIp}`,
    };
  }

  const ipSockets = wsConnectionsByIp.get(clientIp);
  if (ipSockets && ipSockets.size >= MAX_CONCURRENT_WS_PER_IP) {
    return {
      allowed: false,
      reason: "Too many active sessions from this IP",
      logEvent: "ws-concurrency",
      error: `Max concurrent connections reached for IP ${clientIp}`,
    };
  }

  return { allowed: true };
}

export function registerWsConnection(clientIp, ws) {
  const now = Date.now();
  const timestamps = wsConnectTimestampsByIp.get(clientIp) || [];
  timestamps.push(now);
  wsConnectTimestampsByIp.set(clientIp, timestamps);

  let ipSockets = wsConnectionsByIp.get(clientIp);
  if (!ipSockets) {
    ipSockets = new Set();
    wsConnectionsByIp.set(clientIp, ipSockets);
  }
  ipSockets.add(ws);
}

export function removeWsConnection(clientIp, ws) {
  const ipSockets = wsConnectionsByIp.get(clientIp);
  if (ipSockets) {
    ipSockets.delete(ws);
    if (ipSockets.size === 0) {
      wsConnectionsByIp.delete(clientIp);
    }
  }
}

export function checkAdminLoginLock(clientIp) {
  const now = Date.now();
  const lockInfo = failedAdminLogins.get(clientIp);

  if (lockInfo && lockInfo.lockedUntil > now) {
    const remainingMinutes = Math.ceil((lockInfo.lockedUntil - now) / 60000);
    return { isLocked: true, remainingMinutes };
  }

  return { isLocked: false };
}

export function recordFailedAdminLogin(clientIp) {
  const now = Date.now();
  const lockInfo = failedAdminLogins.get(clientIp);
  const attempts = (lockInfo?.count || 0) + 1;
  const lockedUntil =
    attempts >= MAX_ADMIN_LOGIN_ATTEMPTS ? now + ADMIN_LOCK_DURATION_MS : 0;

  failedAdminLogins.set(clientIp, { count: attempts, lockedUntil });

  return {
    isLocked: lockedUntil > 0,
    attemptsRemaining: Math.max(0, MAX_ADMIN_LOGIN_ATTEMPTS - attempts),
  };
}

export function clearFailedAdminLogin(clientIp) {
  failedAdminLogins.delete(clientIp);
}
