import React, { Suspense, lazy, memo } from 'react';
import { OnlineCountContextProvider } from '@providers';
import { useAudio, useWebSocket } from '@hooks';

// Lazy load main chat components with preloading
const ChatContainer = lazy(() =>
  import(/* webpackChunkName: "chat-container" */ '@components/layout/container/ChatContainer')
);
const ChatHeader = lazy(() => import(/* webpackChunkName: "chat-header" */ '@components/layout/header'));
const ChatLog = lazy(() => import(/* webpackChunkName: "chat-log" */ '@components/chat/ChatLog'));
const TypingIndicator = lazy(() =>
  import(/* webpackChunkName: "typing-indicator" */ '@components/input/TypingIndicator')
);
const MessageInput = lazy(() => import(/* webpackChunkName: "message-input" */ '@components/input/MessageInput'));
import Loader from '@/components/ui/Loader';

// Preload critical components after initial load
if (typeof window !== 'undefined') {
  // Preload components that will be used soon
  setTimeout(() => {
    import('@components/layout/container/ChatContainer');
    import('@components/layout/header');
    import('@components/chat/ChatLog');
  }, Number(import.meta.env.VITE_PRELOAD_DELAY) || 1000);
}

function Home() {
  const { playSound } = useAudio();
  return (
    <OnlineCountContextProvider>
      <Suspense fallback={<Loader />}>
        <HomeWithWebSocket playSound={playSound} />
      </Suspense>
    </OnlineCountContextProvider>
  );
}

// Memoize the main component to prevent unnecessary re-renders
const HomeWithWebSocket = memo(({ playSound }) => {
  const { isStrangerConnected, isConnected, messages, typingStatus, sendMessage, serverError, isReconnecting } =
    useWebSocket(playSound);

  // Memoize handlers to prevent child re-renders
  const handleSendMessage = React.useCallback(
    (data) => {
      sendMessage(data);
    },
    [sendMessage]
  );

  const handleTyping = React.useCallback(() => {
    if (isStrangerConnected) {
      sendMessage({ type: 'typing' });
    }
  }, [isStrangerConnected, sendMessage]);

  return (
    <div
      id="annoychat"
      className="bg-white dark:bg-gray-950 text-white flex items-center justify-center px-4 pt-2 pb-1 md:py-2 lg:py-4 relative overflow-hidden min-h-[100dvh] h-[100dvh]"
    >
      <Suspense fallback={<Loader />}>
        <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full h-full">
          <ChatContainer>
            <ChatHeader
              isStrangerConnected={isStrangerConnected}
              isConnected={isConnected}
              serverError={serverError}
              isReconnecting={isReconnecting}
            />
            <ChatLog messages={messages} />
            <TypingIndicator typingStatus={typingStatus} />
            <MessageInput
              onSendMessage={handleSendMessage}
              onTyping={handleTyping}
              isConnected={isConnected}
              isStrangerConnected={isStrangerConnected}
            />
          </ChatContainer>
        </div>
      </Suspense>
      {/* Toast implement soon */}
      {/*
      <Suspense fallback={null}>
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: "", type: "info" })}
        />
      </Suspense>
      */}
    </div>
  );
});

export default Home;
