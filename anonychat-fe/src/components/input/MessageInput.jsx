import { useState, useRef } from 'react';
import { isMobileDevice } from '@utils/isMobileDevice';

// Use env variable for rate limit
const RATE_LIMIT_MS = Number(import.meta.env.VITE_MSG_RATE_LIMIT) || 100;
import { generateMessageId } from '@utils/date';

const MessageInput = ({ onSendMessage, onTyping, isConnected, isStrangerConnected }) => {
  const [message, setMessage] = useState('');
  const typingTimeoutRef = useRef(null);
  const textareaRef = useRef(null);
  const buttonRef = useRef(null);

  const handleTyping = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      onTyping();
    }, 300);
  };

  // Simple client-side rate limit
  const lastSentRef = useRef(0);

  const handleSend = () => {
    // console.log('handleSend called', { message, isConnected });

    const trimmed = message.trim();
    // console.log('Trimmed message:', trimmed);

    // More robust validation that handles newlines
    if (!trimmed || !isConnected) {
      // console.log('Send blocked:', { hasContent: !!trimmed, isConnected });
      return;
    }

    const now = Date.now();
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      // console.log('Rate limited');
      return;
    }
    lastSentRef.current = now;

    const messageId = generateMessageId();
    // console.log('Sending message:', { type: 'text', data: trimmed, id: messageId });

    onSendMessage({
      type: 'text',
      data: trimmed,
      id: messageId,
    });
    setMessage('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    const isMobile = isMobileDevice();
    // console.log('Key pressed:', e.key, 'isMobile:', isMobile);

    if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      handleTyping();
      // Ensure button remains clickable after Enter on mobile
      if (e.key === 'Enter' && isMobile) {
        // console.log('Enter pressed on mobile, ensuring button clickability');
        // Force a small delay to ensure the button is re-rendered as clickable
        setTimeout(() => {}, 10);
      }
    }
  };

  const handleTextareaChange = (e) => {
    // console.log('Textarea changed:', e.target.value);
    setMessage(e.target.value);
    // Auto-resize textarea
    if (e.target) {
      e.target.style.height = 'auto';
      e.target.style.height = e.target.scrollHeight + 'px';
    }
  };

  // More robust content detection that handles newlines properly
  const hasContent = message.trim().length > 0;
  const isMobile = isMobileDevice();
  const inputDisabled = !isConnected || !isStrangerConnected;

  const handleButtonClick = (e) => {
    // console.log('Button clicked!', e.type);
    e.preventDefault();
    e.stopPropagation();

    // Small delay to ensure state is updated
    setTimeout(() => {
      handleSend();
    }, 10);
  };

  return (
    <div className="w-full max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto pt-1 pb-1">
      <div className="relative flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          className={`flex-1 min-h-11 max-h-36 resize-none touch-manipulation align-middle transition-all duration-300 rounded-lg px-4 py-3 border text-sm md:text-base font-mono tracking-tight [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]
            ${
              !inputDisabled
                ? 'bg-gray-900 text-white placeholder-gray-400 border-gray-700 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-lg'
                : 'bg-gray-800 text-gray-400 placeholder-gray-500 cursor-not-allowed border-gray-600'
            }
          `}
          placeholder={inputDisabled ? '' : 'Type a message...'}
          disabled={inputDisabled}
          rows={1}
          autoComplete="off"
        />

        {/* Always show send button on mobile for better UX */}
        {hasContent && isConnected && (
          <button
            ref={buttonRef}
            type="button"
            onTouchStart={(e) => e.preventDefault()}
            onTouchEnd={handleButtonClick}
            onClick={handleButtonClick}
            onMouseDown={(e) => e.preventDefault()}
            disabled={inputDisabled || !message.trim()}
            className={`min-w-11 min-h-11 shrink-0 touch-manipulation select-none transition-all duration-200 rounded-lg flex items-center justify-center relative z-10 ${
              hasContent && isConnected
                ? 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white cursor-pointer'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
            style={{
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
            }}
            aria-label="Send message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Mobile-specific instructions */}
      {isMobile && <p className="text-xs text-gray-500 my-2 text-center">Tap the send button to send your message</p>}
    </div>
  );
};

export default MessageInput;
