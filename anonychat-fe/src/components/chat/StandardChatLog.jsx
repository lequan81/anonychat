import { memo, useRef, useEffect } from 'react';

// Standard scroll behavior for chat logs
const StandardChatLog = memo(({ messages, children }) => {
  const logRef = useRef(null);

  // Auto-scroll effect
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTo({
        top: logRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  return (
    <div
      ref={logRef}
      className="flex-1 overflow-y-auto bg-gray-900 rounded-md p-2 md:p-4 mt-4 text-sm space-y-1 min-h-0 shadow-inner border border-gray-800 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[rgba(255,255,255,0.1)] [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-track]:bg-transparent"
      aria-live="polite"
      role="log"
      tabIndex={0}
    >
      {(messages || []).map((msg, idx) => (
        <div key={`standard-${idx}`}>{children(msg, idx)}</div>
      ))}
    </div>
  );
});

export default StandardChatLog;
