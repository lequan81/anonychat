import { Router } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  ADMIN_PASSWORD,
  ADMIN_SESSION_TTL_MS,
  MAX_ADMIN_ANNOUNCEMENT_LENGTH,
  sanitizeTextInput,
} from "../config/index.js";
import chatLogger from "../logging/logger.js";
import { readRecentFeedback } from "../logging/feedbackLog.js";
import {
  getClientIp,
  checkAdminLoginLock,
  recordFailedAdminLogin,
  clearFailedAdminLogin,
} from "../services/rateLimiter.js";
import {
  getConnections,
  getOnlineCount,
  getWaitingCount,
  getActivePairsCount,
  safeSend,
} from "../services/matchmaker.js";

const router = Router();
const adminSessions = new Map();

function isAdminPasswordValid(password) {
  if (typeof ADMIN_PASSWORD !== "string" || !ADMIN_PASSWORD) {
    return false;
  }

  const supplied = Buffer.from(password);
  const expected = Buffer.from(ADMIN_PASSWORD);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

function getAdminSession(request) {
  const authorization = request.get("authorization") ?? "";
  const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization);
  if (!match) return null;

  const expiresAt = adminSessions.get(match[1]);
  if (!expiresAt) return null;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(match[1]);
    return null;
  }
  return match[1];
}

router.post("/login", (request, response) => {
  const clientIp = getClientIp(request);
  const now = Date.now();
  const lockStatus = checkAdminLoginLock(clientIp);

  if (lockStatus.isLocked) {
    response.status(429).json({
      error: `Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${lockStatus.remainingMinutes} phút.`,
    });
    return;
  }

  if (!ADMIN_PASSWORD) {
    response
      .status(503)
      .json({ error: "Trang admin chưa được cấu hình trên server." });
    return;
  }

  if (
    typeof request.body?.password !== "string" ||
    !isAdminPasswordValid(request.body.password)
  ) {
    const failureResult = recordFailedAdminLogin(clientIp);

    if (failureResult.isLocked) {
      response.status(429).json({
        error: "Bạn đã nhập sai mật khẩu 5 lần. IP bị tạm khóa trong 15 phút.",
      });
      return;
    }

    response.status(401).json({
      error: `Mật khẩu admin không đúng. Còn ${failureResult.attemptsRemaining} lần thử.`,
    });
    return;
  }

  clearFailedAdminLogin(clientIp);

  // Prune expired sessions
  for (const [token, expiresAt] of adminSessions) {
    if (expiresAt <= now) adminSessions.delete(token);
  }

  const token = randomBytes(32).toString("hex");
  adminSessions.set(token, now + ADMIN_SESSION_TTL_MS);
  response.json({ token, expiresInSeconds: ADMIN_SESSION_TTL_MS / 1000 });
});

router.post("/announcements", (request, response) => {
  if (!getAdminSession(request)) {
    response
      .status(401)
      .json({ error: "Phiên admin đã hết hạn. Vui lòng đăng nhập lại." });
    return;
  }

  const message = sanitizeTextInput(
    request.body?.message,
    MAX_ADMIN_ANNOUNCEMENT_LENGTH
  );
  if (!message) {
    response.status(400).json({
      error: `Thông báo phải dài từ 1 đến ${MAX_ADMIN_ANNOUNCEMENT_LENGTH} ký tự hợp lệ.`,
    });
    return;
  }

  let recipientCount = 0;
  getConnections().forEach((ws) => {
    if (safeSend(ws, { type: "announcement", message })) recipientCount++;
  });
  response.json({ recipientCount });
});

router.get("/feedback", async (request, response) => {
  if (!getAdminSession(request)) {
    response
      .status(401)
      .json({ error: "Phiên admin đã hết hạn. Vui lòng đăng nhập lại." });
    return;
  }

  try {
    const feedback = await readRecentFeedback();
    response.json({ feedback });
  } catch (error) {
    chatLogger.connectionError("admin-feedback", error);
    response.status(500).json({ error: "Không thể tải góp ý lúc này." });
  }
});

router.get("/stats", (request, response) => {
  if (!getAdminSession(request)) {
    response
      .status(401)
      .json({ error: "Phiên admin đã hết hạn. Vui lòng đăng nhập lại." });
    return;
  }

  response.json({
    onlineCount: getOnlineCount(),
    waitingUsers: getWaitingCount(),
    activePairs: getActivePairsCount(),
  });
});

router.delete("/session", (request, response) => {
  const token = getAdminSession(request);
  if (!token) {
    response.status(401).json({ error: "Phiên admin đã hết hạn." });
    return;
  }

  adminSessions.delete(token);
  response.status(204).end();
});

export default router;
