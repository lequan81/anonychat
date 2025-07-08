// Date/time formatting helpers

// Returns a unique message id
export function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Formats timestamp to HH:mm 24-hour format
export function formatMessageTime(timestamp) {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// Add more date formatting helpers as needed
