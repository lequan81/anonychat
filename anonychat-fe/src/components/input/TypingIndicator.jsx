import React, { memo } from 'react';

const TypingIndicator = memo(({ typingStatus }) => {
  // Only show animation if typingStatus is truthy
  return (
    <div
      className={`h-6 min-h-6 flex items-center pl-1 transition-opacity duration-300 mt-0.5 mb-2 ${
        typingStatus ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      aria-live="polite"
      role="status"
    >
      <span className="flex items-center w-full text-xs md:text-sm">
        <span className="animate-pulse mr-1">💬</span>
        <span className="mr-2 transition-all duration-300">Stranger typing</span>
        <span
          className="inline-block animate-typing-dots"
          aria-label="Stranger typing"
        >
          <TypingDots show={!!typingStatus} />
        </span>
      </span>
    </div>
  );
});

// Helper component for animated dots
function TypingDots({ show }) {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (!show) return;
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 4);
    }, 400);
    return () => clearInterval(interval);
  }, [show]);
  return <span>{['', '.', '..', '...'][step]}</span>;
}

export default TypingIndicator;
