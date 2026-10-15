import path from "node:path";

export function parsePositiveInteger(envName, fallback, min = 1) {
  const raw = process.env[envName];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(
      `Environment variable ${envName} must be an integer >= ${min} (received: "${raw}")`
    );
  }
  return parsed;
}

export function parseBoolean(envName, fallback = true) {
  const raw = process.env[envName];
  if (raw === undefined || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error(
    `Environment variable ${envName} must be a boolean ('true' or 'false', received: "${raw}")`
  );
}

// Network and server settings
export const PORT = parsePositiveInteger("PORT", 3000);
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "";

// Reconnect and heartbeat settings
export const RECONNECT_GRACE_SECONDS = parsePositiveInteger("RECONNECT_GRACE_SECONDS", 120);
export const RECONNECT_GRACE_MS = RECONNECT_GRACE_SECONDS * 1000;
export const WS_HEARTBEAT_INTERVAL_SECONDS = parsePositiveInteger("WS_HEARTBEAT_INTERVAL_SECONDS", 15);
export const WS_HEARTBEAT_INTERVAL_MS = WS_HEARTBEAT_INTERVAL_SECONDS * 1000;
export const WS_HEARTBEAT_MISSED_THRESHOLD = parsePositiveInteger("WS_HEARTBEAT_MISSED_THRESHOLD", 3);
export const PAIR_REMATCH_COOLDOWN_SECONDS = parsePositiveInteger("PAIR_REMATCH_COOLDOWN_SECONDS", 15);
export const PAIR_REMATCH_COOLDOWN_MS = PAIR_REMATCH_COOLDOWN_SECONDS * 1000;

// Rate limiting & concurrency settings
export const MAX_CONCURRENT_WS_PER_IP = parsePositiveInteger("MAX_CONCURRENT_WS_PER_IP", 3);
export const MAX_WS_CONNECTS_PER_MINUTE = parsePositiveInteger("MAX_WS_CONNECTS_PER_MINUTE", 10);

// Payload & media limits
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_MESSAGE_LENGTH = 2000;
export const MAX_FEEDBACK_LENGTH = 2000;
export const MAX_FEEDBACK_USERNAME_LENGTH = 80;
export const FEEDBACK_COOLDOWN_MS = 60 * 1000;
export const IMAGE_CHUNK_HEADER = 40; // 36 bytes UUID + 4 bytes chunkIndex uint32 BE
export const MAX_IMAGE_CHUNKS = Math.ceil(MAX_IMAGE_BYTES / (64 * 1024)) + 1; // ~81 for 5MB
export const WS_MAX_PAYLOAD = 7 * 1024 * 1024;

// Logging settings
export const MESSAGE_LOGGING_ENABLED = parseBoolean("MESSAGE_LOGGING_ENABLED", true);
export const LOGS_DIRECTORY = process.env.LOGS_DIR
  ? path.resolve(process.env.LOGS_DIR)
  : path.resolve(process.cwd(), "logs");

// Admin configuration
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
export const MAX_ADMIN_ANNOUNCEMENT_LENGTH = 1000;
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const MAX_ADMIN_LOGIN_ATTEMPTS = 5;
export const ADMIN_LOCK_DURATION_MS = 15 * 60 * 1000;

// Directories
export const PUBLIC_DIRECTORY = path.resolve(process.cwd(), "public");

// Text sanitization regex (removes control codes & BiDi override characters)
const CONTROL_AND_BIDI_REGEX =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function sanitizeTextInput(rawText, maxLength = MAX_TEXT_MESSAGE_LENGTH) {
  if (typeof rawText !== "string") return "";
  const sanitized = rawText
    .normalize("NFC")
    .replace(CONTROL_AND_BIDI_REGEX, "")
    .trim();
  return sanitized.slice(0, maxLength);
}

export function decodeImageData(data) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[1].length % 4 !== 0) {
    return null;
  }

  const imageBytes = Buffer.from(match[1], "base64");
  if (
    imageBytes.length === 0 ||
    imageBytes.length > MAX_IMAGE_BYTES ||
    imageBytes.toString("base64") !== match[1] ||
    imageBytes[0] !== 0xff ||
    imageBytes[1] !== 0xd8 ||
    imageBytes[2] !== 0xff
  ) {
    return null;
  }

  return imageBytes;
}
