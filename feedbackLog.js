import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FEEDBACK_FILE = path.join(directory, 'logs', 'feedback', 'feedback.jsonl');
let writeQueue = Promise.resolve();

async function writeFeedback(entry, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', flag: 'a' });
}

export function appendFeedbackLog(entry, filePath = DEFAULT_FEEDBACK_FILE) {
  const write = writeQueue.then(() => writeFeedback(entry, filePath));
  writeQueue = write.then(() => undefined, () => undefined);
  return write;
}
