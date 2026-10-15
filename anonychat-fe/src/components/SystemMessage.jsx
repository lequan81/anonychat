import React, { useState, useEffect } from 'react';
import { cn } from '../utils/cn.js';

const SYSTEM_RULES = [
  { match: 'connection restored', label: 'Đã kết nối lại với máy chủ', status: 'connected' },
  { match: 'reconnected to your stranger', label: 'Đã kết nối lại', status: 'connected' },
  { match: 'stranger reconnected', label: 'Người lạ đã kết nối lại', status: 'connected' },
  { match: 'connected to a stranger', label: 'Đã kết nối với người lạ', status: 'connected' },
  { match: 'connection lost. retrying', label: 'Đang kết nối lại với máy chủ', status: 'reconnecting' },
  { match: 'connection lost', label: 'Người lạ mất kết nối · Đang chờ kết nối lại', status: 'reconnecting' },
  { match: 'conversation ended', label: 'Đã kết thúc · Đang tìm người mới', status: 'idle' },
  { match: 'stranger disconnected', label: 'Người lạ đã rời khỏi phòng chat', status: 'idle' },
  { match: 'waiting for a stranger', label: 'Đang chờ người lạ tham gia', status: 'idle' }
];

const STATUS_STYLES = {
  connected: {
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]',
    text: 'text-emerald-300'
  },
  reconnecting: {
    dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]',
    text: 'text-amber-300'
  },
  idle: {
    dot: 'bg-zinc-500',
    text: 'text-zinc-400'
  }
};

function parseSystemMessage(rawText) {
  const normalized = (rawText || '').toLowerCase();
  const matched = SYSTEM_RULES.find((rule) => normalized.includes(rule.match));
  if (matched) {
    return { label: matched.label, status: matched.status };
  }
  return {
    label: (rawText || '').replace(/^\[SYSTEM\]\s*/i, ''),
    status: 'idle'
  };
}

export const SystemMessage = React.memo(({ message }) => {
  const hasCountdown = Number.isInteger(message.reconnectSeconds) && message.reconnectSeconds > 0;
  const countdownStartedAt = message.reconnectStartedAt || message.timestamp;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!hasCountdown || message.reconnectEndedAt) return undefined;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasCountdown, message.reconnectEndedAt]);

  const remainingSeconds = Math.max(
    0,
    Math.ceil((countdownStartedAt + (message.reconnectSeconds || 0) * 1000 - now) / 1000)
  );
  const countdownActive = hasCountdown && !message.reconnectEndedAt && remainingSeconds > 0;

  const { label, status } = parseSystemMessage(message.system);
  const styles = STATUS_STYLES[status] || STATUS_STYLES.idle;

  return (
    <div className="my-2.5 flex items-center gap-2.5 py-1 select-none" role="status">
      <span className="h-px flex-1 bg-zinc-800/80" />
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full transition-colors',
          styles.dot,
          countdownActive && 'motion-safe:animate-pulse'
        )}
      />
      <span className={cn('text-center text-xs font-medium tracking-wide', styles.text)}>
        {label}
        {hasCountdown && !message.reconnectEndedAt ? ` · ${remainingSeconds}s` : ''}
      </span>
      <span className="h-px flex-1 bg-zinc-800/80" />
    </div>
  );
});

SystemMessage.displayName = 'SystemMessage';

export default SystemMessage;
