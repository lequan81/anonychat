import { appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { LOGS_DIRECTORY } from "../config/index.js";

const DEFAULT_LOG_ROOT = process.env.MESSAGE_LOG_DIR
  ? path.resolve(process.env.MESSAGE_LOG_DIR)
  : path.join(LOGS_DIRECTORY, "messages");

const MAX_MESSAGE_LOG_BYTES = 20 * 1024 * 1024;
const writeQueues = new Map();

function getUtcDateParts(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Message log timestamp must be a valid date");
  }

  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
    day: String(date.getUTCDate()).padStart(2, "0"),
  };
}

async function writeEntry(entry, root) {
  const { year, month, day } = getUtcDateParts(entry.timestamp);
  const dayDirectory = path.join(root, year, month, day);
  const line = `${JSON.stringify(entry)}\n`;
  const lineBytes = Buffer.byteLength(line);

  if (lineBytes > MAX_MESSAGE_LOG_BYTES) {
    throw new RangeError("Message is too large for a message log file");
  }

  await mkdir(dayDirectory, { recursive: true });

  for (let index = 1; ; index++) {
    const filePath = path.join(
      dayDirectory,
      `messages-${String(index).padStart(3, "0")}.jsonl`
    );
    let currentSize = 0;

    try {
      currentSize = (await stat(filePath)).size;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    if (currentSize + lineBytes <= MAX_MESSAGE_LOG_BYTES) {
      await appendFile(filePath, line, { encoding: "utf8", flag: "a" });
      return;
    }
  }
}

export function appendMessageLog(entry, root = DEFAULT_LOG_ROOT) {
  const { year, month, day } = getUtcDateParts(entry.timestamp);
  const dateKey = `${year}-${month}-${day}`;
  const previousWrite = writeQueues.get(dateKey) ?? Promise.resolve();
  const write = previousWrite.then(() => writeEntry(entry, root));
  const queueTail = write.then(
    () => undefined,
    () => undefined
  );

  writeQueues.set(dateKey, queueTail);
  queueTail.then(() => {
    if (writeQueues.get(dateKey) === queueTail) {
      writeQueues.delete(dateKey);
    }
  });

  return write;
}

export { MAX_MESSAGE_LOG_BYTES };
