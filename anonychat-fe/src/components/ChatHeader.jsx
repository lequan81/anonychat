import React, { useState, useEffect } from 'react';
import { cn } from '../utils/cn.js';

export const OnlineCounter = React.memo(({ count }) => {
  const [prevCount, setPrevCount] = useState(count);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (count !== prevCount) {
      setIsAnimating(true);
      const timer = window.setTimeout(() => {
        setIsAnimating(false);
        setPrevCount(count);
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [count, prevCount]);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-zinc-300 transition-transform duration-300',
        isAnimating ? 'scale-105' : 'scale-100'
      )}
    >
      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
      <span>{count ?? 0}</span>
      <span className="hidden min-[380px]:inline text-zinc-400">online</span>
    </div>
  );
});

OnlineCounter.displayName = 'OnlineCounter';

export const ChatHeader = React.memo(({
  onlineCount,
  hasActiveConversation,
  isUserConnected,
  onEndConversation,
  onOpenDonation,
  onOpenFeedback
}) => (
  <header className="flex shrink-0 items-center justify-between gap-2 rounded-[1.15rem] border border-zinc-800/80 bg-[#111216]/90 px-3 py-2 sm:px-4 sm:py-2.5 backdrop-blur-md shadow-xs select-none">
    {/* Left: Status beacon, brand & feedback */}
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full transition-colors',
          isUserConnected
            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
            : 'bg-zinc-500'
        )}
        role="status"
        aria-label={isUserConnected ? 'Đã kết nối' : 'Đang tìm người lạ'}
      />
      <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300">
        anonychat
      </span>

      {/* Dedicated feedback button */}
      <button
        type="button"
        onClick={onOpenFeedback}
        className="inline-flex min-h-11 min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
        aria-label="Góp ý với admin"
        title="Góp ý với admin"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="hidden sm:inline text-[11px]">Góp ý</span>
      </button>

      {/* Donate button */}
      <button
        type="button"
        onClick={onOpenDonation}
        className="inline-flex min-h-11 min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition-colors hover:border-rose-400/40 hover:bg-rose-500/20 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
        aria-label="Ủng hộ AnonyChat"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-rose-400" aria-hidden="true">
          <path d="M12 21s-8.25-4.73-8.25-11.06A4.69 4.69 0 0 1 12 7.26a4.69 4.69 0 0 1 8.25 2.68C20.25 16.27 12 21 12 21Z" />
        </svg>
        <span className="hidden min-[420px]:inline text-[11px]">Ủng hộ</span>
      </button>
    </div>

    {/* Right: Online counter & End Conversation button */}
    <div className="flex min-w-0 items-center justify-end gap-2.5">
      <OnlineCounter count={onlineCount} />
      {hasActiveConversation && (
        <button
          type="button"
          onClick={onEndConversation}
          className="min-h-11 min-w-[44px] shrink-0 whitespace-nowrap rounded-full border border-rose-500/30 bg-rose-950/40 px-3.5 py-1.5 text-xs font-medium text-rose-200 transition-colors hover:border-rose-400/50 hover:bg-rose-900/50 hover:text-rose-100 active:scale-[0.97]"
        >
          Thoát
        </button>
      )}
    </div>
  </header>
));

ChatHeader.displayName = 'ChatHeader';

export default ChatHeader;
