import { memo } from 'react';
import { MessageBubble } from '@components/chat/message';
import { SystemNotify } from '@components/chat';

// Message renderer with proper key generation
const MessageRenderer = memo(({ message, index }) => {
  // Generate unique key for each message
  const generateKey = (msg, idx) => {
    let key = msg.id || `${msg.timestamp}-${idx}`;

    // Handle duplicate IDs by appending index
    if (idx > 0 && msg.id) {
      key = `${msg.id}-${idx}`;
    }

    if (msg.system) {
      key = `system-${msg.timestamp}-${idx}`;
    }

    return key;
  };

  const key = generateKey(message, index);

  return (
    <div key={key}>
      {message.system ? (
        <SystemNotify message={message.system} />
      ) : (
        <MessageBubble
          message={message.data}
          isMine={message.isMine}
          delivered={message.delivered}
          timestamp={message.timestamp}
        />
      )}
    </div>
  );
});

export default MessageRenderer;
