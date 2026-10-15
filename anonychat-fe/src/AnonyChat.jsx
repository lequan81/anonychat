import React, { useState, useCallback } from 'react';
import { useTabCoordination } from './hooks/useTabCoordination.js';
import { useAudioEffects } from './hooks/useAudioEffects.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useVisualViewport } from './hooks/useVisualViewport.js';
import { useEasterEggs } from './hooks/useEasterEggs.js';
import ChatHeader from './components/ChatHeader.jsx';
import ChatLog from './components/ChatLog.jsx';
import MessageInput from './components/MessageInput.jsx';
import EasterEggCelebration from './components/EasterEggCelebration.jsx';

// Code-split secondary views & modals to eliminate them from initial bundle
const AdminConsole = React.lazy(() => import('./components/AdminConsole.jsx'));
const FeedbackModal = React.lazy(() => import('./components/FeedbackModal.jsx'));
const DonationModal = React.lazy(() => import('./components/DonationModal.jsx'));

const ChatContainer = ({ children }) => (
  <div className="relative h-full min-h-0 w-full max-w-none rounded-none bg-[#090a0d] p-0 xl:max-w-xl xl:rounded-[1.6rem] xl:p-2.5">
    <div className="relative flex h-full min-h-0 flex-col gap-2 md:gap-2.5">{children}</div>
  </div>
);

const ChatApp = () => {
  const { isPrimaryTab, claimPrimary } = useTabCoordination();
  const { playSound } = useAudioEffects();
  const {
    isUserConnected,
    hasActiveConversation,
    messages,
    sendMessage,
    sendImage,
    sendReaction,
    onlineCount,
    activityEventCount,
    eventMilestoneTypesRef,
    sendFeedback,
    feedbackStatus,
    clearFeedbackStatus
  } = useWebSocket(playSound, isPrimaryTab);

  // Custom Hooks for mobile viewport and milestone celebrations
  const { viewportHeight, keyboardOffset } = useVisualViewport();
  const { activeCelebration } = useEasterEggs(messages, activityEventCount, eventMilestoneTypesRef);

  // State Machine for modals: null | 'feedback' | 'donation'
  const [activeModal, setActiveModal] = useState(null);
  const [isEnding, setIsEnding] = useState(false);

  const handleSendMessage = useCallback(
    (data) => {
      sendMessage(data);
    },
    [sendMessage]
  );

  const handleTyping = useCallback(() => {
    if (isUserConnected) {
      sendMessage({ type: 'typing' });
    }
  }, [isUserConnected, sendMessage]);

  const handleEndConversation = useCallback(() => {
    if (isEnding) return;
    setIsEnding(true);
    sendMessage({ type: 'endConversation' });
    setTimeout(() => setIsEnding(false), 1500);
  }, [isEnding, sendMessage]);

  const handleOpenFeedback = useCallback(() => {
    clearFeedbackStatus();
    if (isUserConnected) {
      sendMessage({ type: 'adminFeedback' });
    }
    setActiveModal('feedback');
  }, [clearFeedbackStatus, isUserConnected, sendMessage]);

  const handleCloseModal = useCallback(() => {
    setActiveModal(null);
    clearFeedbackStatus();
  }, [clearFeedbackStatus]);

  const handleOpenDonation = useCallback(() => {
    setActiveModal('donation');
  }, []);

  const handleSubmitFeedback = useCallback(
    (feedback) => {
      sendFeedback(feedback);
    },
    [sendFeedback]
  );

  return (
    <div
      className="fixed inset-x-0 top-0 flex items-center justify-center overflow-hidden bg-[#08090b] px-1 py-3 text-zinc-100 md:px-2 md:py-8 xl:px-8 select-none"
      style={{
        fontFamily: 'Maple Mono, monospace',
        height: `${viewportHeight}px`,
        paddingBottom: keyboardOffset > 0 ? 'max(0.75rem, env(safe-area-inset-bottom))' : undefined,
        paddingTop: keyboardOffset > 0 ? 'max(0.75rem, env(safe-area-inset-top))' : undefined,
        justifyContent: keyboardOffset > 0 ? 'flex-start' : 'center'
      }}
    >
      {/* Subtle background grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:18px_18px]"
        aria-hidden="true"
      />

      {activeCelebration && (
        <EasterEggCelebration
          key={activeCelebration.revision}
          celebration={activeCelebration}
        />
      )}

      {/* Accessible SEO headings */}
      <div className="sr-only" aria-live="polite">
        <h1>AnonyChat - Anonymous Private 1:1 Chat</h1>
        <p>
          Anonymous chat with strangers online, private one-to-one conversations, real-time messaging, and instant matching.
        </p>
        <p>
          Trò chuyện ẩn danh với người lạ trực tuyến, cuộc trò chuyện riêng tư theo cặp, nhắn tin thời gian thực và ghép cặp tức thì.
        </p>
      </div>

      <ChatContainer>
        <ChatHeader
          onlineCount={onlineCount}
          hasActiveConversation={hasActiveConversation}
          isUserConnected={isUserConnected}
          onEndConversation={handleEndConversation}
          onOpenDonation={handleOpenDonation}
          onOpenFeedback={handleOpenFeedback}
        />
        <ChatLog
          messages={messages}
          isUserConnected={isUserConnected}
          onReact={sendReaction}
        />
        <MessageInput
          onSendMessage={handleSendMessage}
          onSendImage={sendImage}
          onTyping={handleTyping}
          onOpenAdmin={handleOpenFeedback}
          isConnected={isUserConnected}
        />
      </ChatContainer>

      {/* Lazy Loaded Modals with Suspense */}
      {activeModal === 'feedback' && (
        <React.Suspense fallback={null}>
          <FeedbackModal
            status={feedbackStatus}
            onClose={handleCloseModal}
            onSubmit={handleSubmitFeedback}
          />
        </React.Suspense>
      )}

      {activeModal === 'donation' && (
        <React.Suspense fallback={null}>
          <DonationModal onClose={handleCloseModal} />
        </React.Suspense>
      )}

      {/* Active Tab Mutex Screen */}
      {!isPrimaryTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/95 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-2xl text-amber-400">
              ⚠️
            </div>
            <h2 className="text-base font-semibold text-zinc-100">
              Đang mở ở một tab khác
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Để bảo đảm phiên chat liên tục và tránh xung đột, AnonyChat chỉ duy trì 1 tab hoạt động cùng lúc.
            </p>
            <button
              type="button"
              onClick={claimPrimary}
              className="mt-5 w-full rounded-xl bg-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white active:scale-[0.98]"
            >
              Sử dụng tại tab này
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const AnonyChat = () =>
  window.location.pathname.replace(/\/+$/, '') === '/admin' ? (
    <React.Suspense fallback={<div className="fixed inset-0 bg-[#08090b]" />}>
      <AdminConsole />
    </React.Suspense>
  ) : (
    <ChatApp />
  );

export default AnonyChat;
