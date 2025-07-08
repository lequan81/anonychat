import { memo } from 'react';
import VirtualizedChatLog from './VirtualizedChatLog';
import StandardChatLog from './StandardChatLog';
import { MessageRenderer } from '@components/chat/message';

const ChatLog = memo(({ messages }) => {
  const VIRTUALIZATION_THRESHOLD = 50; // Switch to virtualization after 50 messages

  // Render function for messages
  const renderMessage = (message, index) => (
    <MessageRenderer
      message={message}
      index={index}
    />
  );

  // Use virtualization for large message lists
  if (messages.length > VIRTUALIZATION_THRESHOLD) {
    return <VirtualizedChatLog messages={messages}>{renderMessage}</VirtualizedChatLog>;
  }

  // Use standard implementation for smaller lists
  return <StandardChatLog messages={messages}>{renderMessage}</StandardChatLog>;
});

export default ChatLog;
