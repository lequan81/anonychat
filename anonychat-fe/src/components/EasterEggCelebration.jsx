import React from 'react';

const getCelebrationMessage = ({ kind, count, intensity }) => {
  const messageIntros = ['Mới khởi động', 'Vào guồng rồi', 'Nhịp chat tăng tốc', 'Bùng nổ tin nhắn'];
  const eventIntros = ['Mới khởi động', 'Tương tác sôi nổi', 'Nhịp độ gắn kết', 'Bùng nổ tương tác'];
  const intro = (kind === 'messages' ? messageIntros : eventIntros)[intensity - 1] || 'Chúc mừng';

  return kind === 'messages'
    ? `${intro} — hai bạn đã gửi ${count} tin nhắn cho nhau!`
    : `${intro} — hai bạn đã đạt ${count} lượt tương tác cùng nhau!`;
};

export const EasterEggCelebration = React.memo(({ celebration }) => (
  <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden select-none">
    <div className="easter-egg-toast-wrap absolute left-1/2 top-[6%]">
      <div
        className={`easter-egg-toast easter-egg-toast--${celebration.intensity} flex max-w-[calc(100vw-2rem)] items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-zinc-950/95 px-4 py-2 text-center text-xs text-emerald-100 shadow-2xl backdrop-blur-md`}
      >
        <span
          className={`easter-egg-emoji easter-egg-emoji--${celebration.intensity} text-base`}
          aria-hidden="true"
        >
          {celebration.icon}
        </span>
        <span className="break-words font-medium">{getCelebrationMessage(celebration)}</span>
      </div>
    </div>
  </div>
));

EasterEggCelebration.displayName = 'EasterEggCelebration';

export default EasterEggCelebration;
