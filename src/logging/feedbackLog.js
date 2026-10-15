import { appendFile, mkdir, open, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { LOGS_DIRECTORY } from "../config/index.js";

const DEFAULT_FEEDBACK_FILE = process.env.FEEDBACK_LOG_FILE
  ? path.resolve(process.env.FEEDBACK_LOG_FILE)
  : path.join(LOGS_DIRECTORY, "feedback", "feedback.jsonl");

const MAX_FEEDBACK_READ_BYTES = 1024 * 1024;
let writeQueue = Promise.resolve();

async function writeFeedback(entry, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function appendFeedbackLog(entry, filePath = DEFAULT_FEEDBACK_FILE) {
  const write = writeQueue.then(() => writeFeedback(entry, filePath));
  writeQueue = write.then(
    () => undefined,
    () => undefined
  );
  return write;
}

export async function readRecentFeedback(
  limit = 100,
  filePath = DEFAULT_FEEDBACK_FILE
) {
  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  if (fileStats.size === 0) return [];

  const start = Math.max(0, fileStats.size - MAX_FEEDBACK_READ_BYTES);
  const length = fileStats.size - start;
  const file = await open(filePath, constants.O_RDONLY);
  let contents;
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, start);
    contents = buffer.toString("utf8", 0, bytesRead);
  } finally {
    await file.close();
  }

  const lines = contents.split(/\r?\n/);
  if (start > 0) lines.shift();

  const feedback = [];
  for (
    let index = lines.length - 1;
    index >= 0 && feedback.length < limit;
    index--
  ) {
    if (!lines[index]) continue;
    feedback.push(JSON.parse(lines[index]));
  }
  return feedback;
}
