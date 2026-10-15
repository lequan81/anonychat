import React, { useState } from 'react';
import { cn } from '../utils/cn.js';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍'];

const MESSAGE_VARIANTS = {
  mine_delivered: 'ml-auto border-emerald-500/30 bg-emerald-950/25 text-zinc-100 shadow-[0_2px_12px_rgba(16,185,129,0.06)]',
  mine_pending: 'ml-auto border-amber-500/30 bg-amber-950/25 text-zinc-100 shadow-[0_2px_12px_rgba(245,158,11,0.06)]',
  peer: 'mr-auto border-zinc-800 bg-[#16181f] text-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.2)]'
};

function getMessageVariantKey(isMine, delivered) {
  if (!isMine) return 'peer';
  return delivered ? 'mine_delivered' : 'mine_pending';
}

export const ChatMessage = React.memo(({
  message,
  image,
  imageProgress,
  isMine,
  delivered,
  reactions,
  reactionAnimation,
  index,
  originIndex,
  author,
  onReact
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedReaction = reactions?.self ?? null;
  const ownReaction = reactions?.self ?? null;
  const peerReaction = reactions?.peer ?? null;
  const hasReactions = Boolean(ownReaction || peerReaction);

  const handleReaction = (emoji) => {
    const sent = onReact({ index, originIndex, author }, emoji);
    if (sent) setPickerOpen(false);
  };

  const variantKey = getMessageVariantKey(isMine, delivered);

  return (
    <div className={cn('flex w-full items-start', isMine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'group relative w-fit max-w-[85%] sm:max-w-[78%]',
          hasReactions && 'pb-5',
          isMine ? 'text-right' : 'text-left'
        )}
      >
        {/* Reaction picker overlay on hover or focus */}
        <div
          className={cn(
            'absolute -top-11 z-20 flex items-center gap-1 rounded-full border border-zinc-700/80 bg-zinc-950/95 px-1.5 py-1 shadow-xl backdrop-blur-md transition-all duration-200',
            pickerOpen
              ? 'pointer-events-auto opacity-100 scale-100'
              : 'pointer-events-none opacity-0 scale-95 group-hover:pointer-events-auto group-hover:opacity-100 group-hover:scale-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-focus-within:scale-100',
            isMine ? 'right-0' : 'left-0'
          )}
          role="group"
          aria-label="Chọn cảm xúc"
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Phản ứng ${emoji}`}
              aria-pressed={selectedReaction === emoji}
              onClick={() => handleReaction(emoji)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-base transition-transform hover:scale-125 hover:bg-zinc-800 active:scale-95',
                selectedReaction === emoji && 'bg-zinc-800 ring-1 ring-zinc-500'
              )}
            >
              {emoji}
            </button>
          ))}
          {selectedReaction && (
            <button
              type="button"
              aria-label="Bỏ reaction"
              onClick={() => handleReaction(null)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              ×
            </button>
          )}
        </div>

        {/* Message bubble */}
        <button
          type="button"
          aria-label="Chạm hoặc nhấn để chọn cảm xúc"
          onClick={() => setPickerOpen((prev) => !prev)}
          className={cn(
            'animate-chat-message w-fit max-w-full break-words rounded-[1.35rem] border px-3.5 py-2.5 text-sm leading-relaxed text-left transition-all duration-200 cursor-pointer',
            isMine ? 'origin-bottom-right' : 'origin-bottom-left',
            MESSAGE_VARIANTS[variantKey]
          )}
        >
          {image ? (
            <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40">
              <img
                src={image}
                alt="Ảnh được gửi trong cuộc trò chuyện"
                loading="lazy"
                className="max-h-80 max-w-full rounded-xl object-contain transition-opacity duration-300"
              />
              {imageProgress !== undefined && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-xs text-xs font-semibold text-white">
                  <div className="h-1.5 w-3/4 max-w-[120px] overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-150"
                      style={{ width: `${imageProgress}%` }}
                    />
                  </div>
                  <span>{imageProgress}%</span>
                </div>
              )}
            </div>
          ) : (
            <span className="block whitespace-pre-wrap">{message}</span>
          )}
        </button>

        {/* Peer Reaction Badge */}
        {peerReaction && (
          <div
            className={cn(
              'absolute -top-3 z-10 flex h-9 w-9 items-center justify-center text-2xl drop-shadow-md select-none',
              isMine ? '-left-3' : '-right-3'
            )}
            aria-label="Reaction của người chat cùng"
          >
            <span className="rotate-12">
              <span
                key={`peer-${reactionAnimation?.emoji === peerReaction ? reactionAnimation.revision : 0}`}
                className={reactionAnimation?.emoji === peerReaction ? 'animate-reaction-spring inline-block' : 'inline-block'}
              >
                {peerReaction}
              </span>
            </span>
          </div>
        )}

        {/* Own Reaction Badge */}
        {ownReaction && (
          <button
            type="button"
            aria-label={`${ownReaction} reaction của bạn, nhấn để bỏ`}
            aria-pressed="true"
            onClick={() => onReact({ index, originIndex, author }, null)}
            className={cn(
              'absolute -bottom-1 z-10 inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-2xl drop-shadow-md cursor-pointer select-none',
              isMine ? '-right-2' : '-left-2'
            )}
            title="Bỏ reaction của bạn"
          >
            <span className="-rotate-12">
              <span
                key={`self-${reactionAnimation?.emoji === ownReaction ? reactionAnimation.revision : 0}`}
                className={reactionAnimation?.emoji === ownReaction ? 'animate-reaction-spring inline-block' : 'inline-block'}
              >
                {ownReaction}
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;
