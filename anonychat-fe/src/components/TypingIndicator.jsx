import React from 'react';

export const TypingIndicator = React.memo(() => (
  <div
    className="mr-auto flex w-fit items-center gap-1.5 rounded-[1.35rem] border border-zinc-800 bg-[#16181f] px-4 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.2)]"
    role="status"
    aria-label="Người lạ đang nhập…"
  >
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:180ms]" />
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:360ms]" />
  </div>
));

TypingIndicator.displayName = 'TypingIndicator';

export default TypingIndicator;
