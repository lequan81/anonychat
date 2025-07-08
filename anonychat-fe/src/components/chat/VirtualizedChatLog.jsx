import { memo, useMemo, useRef, useEffect, useState } from 'react';

// Virtual scrolling for better performance with large message lists
const VirtualizedChatLog = memo(({ messages, itemHeight = 60, containerHeight = 400, children }) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  // Calculate visible items
  const { startIndex, visibleItems, totalHeight } = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight) + 2; // Buffer
    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.min(start + visibleCount, messages.length);

    return {
      startIndex: start,
      visibleItems: messages.slice(start, end),
      totalHeight: messages.length * itemHeight,
    };
  }, [messages, scrollTop, itemHeight, containerHeight]);

  // Handle scroll with throttling
  const handleScroll = useRef(
    (() => {
      let ticking = false;
      return (e) => {
        if (!ticking) {
          requestAnimationFrame(() => {
            setScrollTop(e.target.scrollTop);
            ticking = false;
          });
          ticking = true;
        }
      };
    })()
  );

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;

      if (isNearBottom) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });
      }
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-gray-900 rounded-md p-2 md:p-4 mt-4 text-sm min-h-0 shadow-inner border border-gray-800 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[rgba(255,255,255,0.1)] [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-track]:bg-transparent"
      style={{ height: containerHeight }}
      onScroll={handleScroll.current}
      aria-live="polite"
      role="log"
      tabIndex={0}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${startIndex * itemHeight}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((msg, idx) => {
            const actualIndex = startIndex + idx;
            return (
              <div
                key={`virtual-${actualIndex}`}
                style={{ height: itemHeight }}
              >
                {children(msg, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default VirtualizedChatLog;
