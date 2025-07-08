import { memo } from 'react';
import { sanitizeMessage } from '@utils/sanitizeMessage';
import { formatMessageTime } from '@utils/date';

const MessageBubble = memo(({ message, isMine, timestamp }) => {
  const safeMessage = sanitizeMessage(message);
  const timeString = formatMessageTime(timestamp);

  return (
    <div
      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-[75%] ${
        isMine ? 'ml-auto' : 'mr-auto'
      } mb-2 md:mb-3`}
    >
      <div
        className={`w-fit p-3 rounded-lg text-sm md:text-base break-words relative transform transition-all duration-100 ease-out shadow-sm
          ${isMine ? 'text-white bg-blue-600 rounded-br-sm' : 'bg-gray-800 text-white rounded-bl-sm'}`}
      >
        {safeMessage}
      </div>
      {timeString && (
        <div className={`text-xs text-gray-500 mt-1 px-1 tabular-nums ${isMine ? 'text-right' : 'text-left'}`}>
          {timeString}
        </div>
      )}
    </div>
  );
});

export default MessageBubble;
