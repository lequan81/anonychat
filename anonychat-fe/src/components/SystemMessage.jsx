import React, { useState, useEffect } from 'react';

export const SystemMessage = React.memo(({ message }) => {
  const normalizedMessage = (message.system || '').toLowerCase();
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

  const isConnected =
    normalizedMessage.includes('connected to a stranger') ||
    normalizedMessage.includes('reconnected') ||
    normalizedMessage.includes('connection restored') ||
    normalizedMessage.includes('connection established');
  const isReconnecting = normalizedMessage.includes('connection lost');

  const dotStyle = isConnected
    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
    : isReconnecting
    ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
    : 'bg-zinc-500';

  const textStyle = isConnected
    ? 'text-emerald-300'
    : isReconnecting
    ? 'text-amber-300'
    : 'text-zinc-400';

  const label = normalizedMessage.includes('connection restored')
    ? 'Đã kết nối lại với máy chủ'
    : normalizedMessage.includes('conversation ended')
    ? 'Đã kết thúc · Đang tìm người mới'
    : normalizedMessage.includes('connection lost. retrying')
    ? 'Đang kết nối lại với máy chủ'
    : normalizedMessage.includes('connection lost')
    ? 'Người lạ mất kết nối · Đang chờ kết nối lại'
    : normalizedMessage.includes('reconnected to your stranger')
    ? 'Đã kết nối lại'
    : normalizedMessage.includes('stranger reconnected')
    ? 'Người lạ đã kết nối lại'
    : normalizedMessage.includes('connected to a stranger')
    ? 'Đã kết nối với người lạ'
    : normalizedMessage.includes('stranger disconnected')
    ? 'Người lạ đã rời khỏi phòng chat'
    : normalizedMessage.includes('waiting for a stranger')
    ? 'Đang chờ người lạ tham gia'
    : (message.system || '').replace(/^\[SYSTEM\]\s*/i, '');

  return (
    <div className="my-2.5 flex items-center gap-2.5 py-1 select-none" role="status">
      <span className="h-px flex-1 bg-zinc-800/80" />
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${dotStyle} ${
          countdownActive ? 'motion-safe:animate-pulse' : ''
        }`}
      />
      <span className={`text-center text-xs font-medium tracking-wide ${textStyle}`}>
        {label}
        {hasCountdown && !message.reconnectEndedAt ? ` · ${remainingSeconds}s` : ''}
      </span>
      <span className="h-px flex-1 bg-zinc-800/80" />
    </div>
  );
});

SystemMessage.displayName = 'SystemMessage';

export default SystemMessage;
