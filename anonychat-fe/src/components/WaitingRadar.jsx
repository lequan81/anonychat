import React from 'react';
import { cn } from '../utils/cn.js';

const RADAR_VARIANTS = {
  connected: {
    ring1: 'border-emerald-500/30',
    ring2: 'border-emerald-500/20',
    ring3: 'border-emerald-500/15',
    beacon: 'border-emerald-500/40 bg-emerald-950/60 text-emerald-400 shadow-emerald-950/40'
  },
  waiting: {
    ring1: 'border-sky-500/25',
    ring2: 'border-sky-500/15',
    ring3: 'border-sky-500/10',
    beacon: 'border-sky-500/30 bg-sky-950/50 text-sky-400 shadow-sky-950/30'
  }
};

export const WaitingRadar = React.memo(({ isUserConnected }) => {
  const variant = isUserConnected ? RADAR_VARIANTS.connected : RADAR_VARIANTS.waiting;

  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center select-none">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center">
        {/* Concentric radar rings */}
        <span
          className={cn('absolute inset-0 rounded-full border animate-radar-ring-1', variant.ring1)}
          aria-hidden="true"
        />
        <span
          className={cn('absolute inset-0 rounded-full border animate-radar-ring-2', variant.ring2)}
          aria-hidden="true"
        />
        <span
          className={cn('absolute inset-0 rounded-full border animate-radar-ring-3', variant.ring3)}
          aria-hidden="true"
        />

        {/* Central glowing icon */}
        <div
          className={cn(
            'relative z-10 flex h-14 w-14 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-colors duration-500',
            variant.beacon
          )}
        >
          {isUserConnected ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 motion-safe:animate-pulse"
              aria-hidden="true"
            >
              <path d="M12 2v4" />
              <path d="m16.2 7.8 2.9-2.9" />
              <path d="M18 12h4" />
              <path d="m16.2 16.2 2.9 2.9" />
              <path d="M12 18v4" />
              <path d="m4.9 19.1 2.9-2.9" />
              <path d="M2 12h4" />
              <path d="m4.9 4.9 2.9 2.9" />
            </svg>
          )}
        </div>
      </div>

      <div className="max-w-xs">
        <h2 className="text-base font-semibold tracking-wide text-zinc-100">
          {isUserConnected ? 'Đã tìm thấy người lạ' : 'Đang tìm kiếm người lạ…'}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          {isUserConnected
            ? 'Hãy gửi lời chào mở đầu cuộc trò chuyện thú vị!'
            : 'Đang kết nối ngẫu nhiên 1:1 trong phòng chờ trực tuyến.'}
        </p>
      </div>
    </div>
  );
});

WaitingRadar.displayName = 'WaitingRadar';

export default WaitingRadar;
