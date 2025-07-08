// Sanitize a message string for safe rendering (no HTML injection)
export function sanitizeMessage(msg) {
  if (typeof msg !== 'string') return '';
  return msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
