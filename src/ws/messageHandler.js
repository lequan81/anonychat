import chatLogger from "../logging/logger.js";
import { appendMessageLog } from "../logging/messageLog.js";
import { appendFeedbackLog } from "../logging/feedbackLog.js";
import { safeSend, endConversation } from "../services/matchmaker.js";
import {
  IMAGE_CHUNK_HEADER,
  MAX_IMAGE_CHUNKS,
  MAX_IMAGE_BYTES,
  MESSAGE_LOGGING_ENABLED,
  MAX_TEXT_MESSAGE_LENGTH,
  MAX_FEEDBACK_LENGTH,
  MAX_FEEDBACK_USERNAME_LENGTH,
  FEEDBACK_COOLDOWN_MS,
  sanitizeTextInput,
  decodeImageData,
} from "../config/index.js";

export function handleBinaryChunk(ws, data) {
  if (!Buffer.isBuffer(data) || data.length < IMAGE_CHUNK_HEADER) return;

  const transferId = data.subarray(0, 36).toString("ascii");
  const chunkIndex = data.readUInt32BE(36);

  const transfer = ws.imageTransfers?.get(transferId);
  if (!transfer) return;
  if (chunkIndex >= transfer.totalChunks) return;

  const partner = ws.partner;
  if (!partner || partner.readyState !== partner.OPEN) {
    clearTimeout(transfer.timeout);
    ws.imageTransfers.delete(transferId);
    safeSend(ws, {
      type: "image_cancel",
      id: transferId,
      reason: "no_partner",
    });
    return;
  }

  try {
    partner.send(data, { binary: true });
  } catch (err) {
    chatLogger.connectionError(ws.id, err);
    return;
  }

  transfer.chunksRelayed++;
  if (transfer.chunksRelayed >= transfer.totalChunks) {
    chatLogger.messageSent(ws.id, partner.id, transfer.totalBytes);
    if (MESSAGE_LOGGING_ENABLED) {
      appendMessageLog({
        timestamp: new Date().toISOString(),
        fromUuid: ws.session.clientId,
        toUuid: partner.session.clientId,
        type: "image",
        message: `[chunked:${transfer.totalChunks}:${transfer.totalBytes}b]`,
      }).catch((err) => chatLogger.connectionError(ws.id, err));
    }
    clearTimeout(transfer.timeout);
    ws.imageTransfers.delete(transferId);
  }
}

export async function handleSocketMessage(ws, data, isBinary) {
  ws.isAlive = true;
  ws.missedHeartbeats = 0;

  const now = Date.now();
  if (now - ws.rateWindow.start > 1000) {
    ws.rateWindow = { start: now, textCount: 0, eventCount: 0 };
  }

  if (isBinary) {
    handleBinaryChunk(ws, data);
    return;
  }

  let msg;
  try {
    msg = JSON.parse(data);
  } catch (error) {
    chatLogger.connectionError(ws.id, new Error("Invalid JSON message"));
    return;
  }

  if (msg.type === "text") {
    ws.rateWindow.textCount++;
    if (ws.rateWindow.textCount > 5) {
      return; // throttle excess text messages
    }
  } else if (msg.type === "reaction" || msg.type === "typing") {
    ws.rateWindow.eventCount++;
    if (ws.rateWindow.eventCount > 8) {
      return; // throttle excess events
    }
  }

  if (msg.type === "endConversation") {
    endConversation(ws);
    return;
  }

  // Application-level keepalive: client sends {type:"ping"} to keep proxy connections alive.
  if (msg.type === "ping") {
    safeSend(ws, { type: "pong" });
    return;
  }

  if (msg.type === "image_start") {
    const { id, messageId, messageIndex, totalChunks, totalBytes } = msg;

    if (
      typeof id !== "string" ||
      !/^[\w-]{1,64}$/.test(id) ||
      !Number.isSafeInteger(totalChunks) ||
      totalChunks < 1 ||
      totalChunks > MAX_IMAGE_CHUNKS ||
      !Number.isSafeInteger(totalBytes) ||
      totalBytes <= 0 ||
      totalBytes > MAX_IMAGE_BYTES
    ) {
      safeSend(ws, {
        type: "image_cancel",
        id: typeof id === "string" ? id : "",
        reason: "invalid",
      });
      return;
    }

    if (!ws.partner || ws.partner.readyState !== ws.partner.OPEN) {
      safeSend(ws, { system: "[SYSTEM] No partner available." });
      return;
    }

    ws.imageTransfers = ws.imageTransfers ?? new Map();
    // Limit concurrent transfers per socket
    if (ws.imageTransfers.size >= 3) {
      safeSend(ws, { type: "image_cancel", id, reason: "too_many" });
      return;
    }

    const timeout = setTimeout(() => {
      if (ws.imageTransfers?.has(id)) {
        ws.imageTransfers.delete(id);
        safeSend(ws, { type: "image_cancel", id, reason: "timeout" });
        if (ws.partner?.readyState === ws.partner?.OPEN) {
          safeSend(ws.partner, {
            type: "image_cancel",
            id,
            reason: "timeout",
          });
        }
      }
    }, 60000);
    timeout.unref();

    ws.imageTransfers.set(id, {
      totalChunks,
      totalBytes,
      chunksRelayed: 0,
      timeout,
    });

    safeSend(ws.partner, {
      type: "image_start",
      id,
      messageId:
        typeof messageId === "string" && messageId.length <= 100
          ? messageId
          : undefined,
      messageIndex: Number.isSafeInteger(messageIndex)
        ? messageIndex
        : undefined,
      totalChunks,
      totalBytes,
    });
    return;
  }

  if (msg.type === "feedback") {
    const feedback = sanitizeTextInput(msg.data, MAX_FEEDBACK_LENGTH);
    const username = sanitizeTextInput(
      msg.username,
      MAX_FEEDBACK_USERNAME_LENGTH
    );
    if (!feedback) {
      safeSend(ws, {
        type: "feedbackResult",
        ok: false,
        message: `Góp ý phải dài từ 1 đến ${MAX_FEEDBACK_LENGTH} ký tự hợp lệ.`,
      });
      return;
    }

    if (
      (msg.username !== undefined && typeof msg.username !== "string") ||
      username.length > MAX_FEEDBACK_USERNAME_LENGTH
    ) {
      safeSend(ws, {
        type: "feedbackResult",
        ok: false,
        message: `Tên không được vượt quá ${MAX_FEEDBACK_USERNAME_LENGTH} ký tự.`,
      });
      return;
    }

    const remainingCooldown =
      FEEDBACK_COOLDOWN_MS - (Date.now() - (ws.session.lastFeedbackAt ?? 0));
    if (remainingCooldown > 0) {
      safeSend(ws, {
        type: "feedbackResult",
        ok: false,
        message: "Bạn vui lòng chờ một chút trước khi gửi góp ý tiếp theo.",
      });
      return;
    }

    try {
      await appendFeedbackLog({
        timestamp: new Date().toISOString(),
        ...(username ? { username } : {}),
        feedback,
      });
      ws.session.lastFeedbackAt = Date.now();
      safeSend(ws, {
        type: "feedbackResult",
        ok: true,
        message: "Đã gửi góp ý tới admin. Cảm ơn bạn nhé!",
      });
    } catch (error) {
      chatLogger.connectionError(ws.id, error);
      safeSend(ws, {
        type: "feedbackResult",
        ok: false,
        message: "Chưa gửi được góp ý. Bạn thử lại sau nhé.",
      });
    }
    return;
  }

  if (msg.type === "adminFeedback") {
    if (ws.partner?.readyState === ws.partner.OPEN) {
      safeSend(ws.partner, { system: "[SYSTEM] Bên kia đang chửi admin." });
    }
    return;
  }

  if (!ws.partner || ws.partner.readyState !== ws.partner.OPEN) {
    safeSend(ws, { system: "[SYSTEM] No partner available." });
    return;
  }

  // Handle delivery receipts
  if (msg.type === "receipt") {
    safeSend(ws.partner, {
      type: "receipt",
      messageId: msg.messageId,
    });
    return;
  }

  if (msg.type === "reaction") {
    if (
      Number.isSafeInteger(msg.messageIndex) &&
      (msg.author === "self" || msg.author === "peer") &&
      (msg.emoji === null || typeof msg.emoji === "string")
    ) {
      safeSend(ws.partner, {
        type: "reaction",
        messageIndex: msg.messageIndex,
        author: msg.author,
        emoji: msg.emoji,
      });
    }
    return;
  }

  const sanitizedText =
    msg.type === "text"
      ? sanitizeTextInput(msg.data, MAX_TEXT_MESSAGE_LENGTH)
      : null;
  const isTextMessage =
    typeof sanitizedText === "string" && sanitizedText.length > 0;
  const imageBytes =
    msg.type === "image" && typeof msg.data === "string"
      ? decodeImageData(msg.data)
      : null;

  if (msg.type === "image" && !imageBytes) {
    safeSend(ws, {
      system: "[SYSTEM] Image must be a valid JPEG under 5 MB.",
    });
    return;
  }

  if (isTextMessage || imageBytes) {
    const messageId =
      typeof msg.id === "string" && msg.id.length <= 100
        ? msg.id
        : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const recipient = ws.partner;
    const messagePayload = isTextMessage ? sanitizedText : msg.data;
    const messageLength = isTextMessage
      ? Buffer.byteLength(messagePayload, "utf8")
      : imageBytes.length;

    if (ws.partner !== recipient || recipient.readyState !== recipient.OPEN) {
      safeSend(ws, { system: "[SYSTEM] No partner available." });
      return;
    }

    chatLogger.messageSent(ws.id, recipient.id, messageLength);

    safeSend(ws, {
      type: isTextMessage ? "text" : "image",
      data: messagePayload,
      from: "self",
      id: messageId,
      messageIndex: Number.isSafeInteger(msg.messageIndex)
        ? msg.messageIndex
        : undefined,
    });

    safeSend(recipient, {
      type: isTextMessage ? "text" : "image",
      data: messagePayload,
      from: "stranger",
      id: messageId,
      messageIndex: Number.isSafeInteger(msg.messageIndex)
        ? msg.messageIndex
        : undefined,
    });

    if (MESSAGE_LOGGING_ENABLED) {
      appendMessageLog({
        timestamp: new Date().toISOString(),
        fromUuid: ws.session.clientId,
        toUuid: recipient.session.clientId,
        type: isTextMessage ? "text" : "image",
        message: messagePayload,
      }).catch((error) => {
        chatLogger.connectionError(ws.id, error);
      });
    }
  }

  if (msg.type === "typing") {
    chatLogger.typingIndicator(ws.id, ws.partner.id);
    safeSend(ws.partner, { type: "typing" });
  }
}
