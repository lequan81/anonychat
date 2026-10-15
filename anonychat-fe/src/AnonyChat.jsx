import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTabCoordination } from './hooks/useTabCoordination.js';
import { useAudioEffects } from './hooks/useAudioEffects.js';
import { useWebSocket, ACTIVITY_MILESTONES, EVENT_ICONS } from './hooks/useWebSocket.js';
import ChatHeader from './components/ChatHeader.jsx';
import ChatLog from './components/ChatLog.jsx';
import MessageInput from './components/MessageInput.jsx';
import FeedbackModal from './components/FeedbackModal.jsx';
import DonationModal from './components/DonationModal.jsx';
import EasterEggCelebration from './components/EasterEggCelebration.jsx';
import AdminConsole from './components/AdminConsole.jsx';

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

  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isDonationOpen, setIsDonationOpen] = useState(false);
  const [easterEggQueue, setEasterEggQueue] = useState([]);
  const [isEnding, setIsEnding] = useState(false);

  const lastCelebratedMilestonesRef = useRef({ messages: 0, events: 0 });
  const celebrationRevisionRef = useRef(0);

  // Milestone / Celebration Tracker
  useEffect(() => {
    const messageCount = messages.filter(
      (message) => message.type === 'text' || message.type === 'image'
    ).length;

    if (messageCount === 0) {
      lastCelebratedMilestonesRef.current.messages = 0;
    }
    if (activityEventCount === 0) {
      lastCelebratedMilestonesRef.current.events = 0;
    }
    if (messageCount === 0 && activityEventCount === 0) {
      setEasterEggQueue((queue) => (queue.length > 0 ? [] : queue));
    }

    const getNewMilestones = (previousCount, currentCount) => {
      const milestones = ACTIVITY_MILESTONES.filter(
        (value) => value > previousCount && value <= currentCount
      );
      if (currentCount > 1000) {
        for (
          let value = Math.max(2000, Math.ceil((previousCount + 1) / 1000) * 1000);
          value <= currentCount;
          value += 1000
        ) {
          milestones.push(value);
        }
      }
      return milestones;
    };

    const newMessageMilestones = getNewMilestones(
      lastCelebratedMilestonesRef.current.messages,
      messageCount
    );
    const newEventMilestones = getNewMilestones(
      lastCelebratedMilestonesRef.current.events,
      activityEventCount
    );

    lastCelebratedMilestonesRef.current = {
      messages: Math.max(lastCelebratedMilestonesRef.current.messages, messageCount),
      events: Math.max(lastCelebratedMilestonesRef.current.events, activityEventCount)
    };

    if (newMessageMilestones.length > 0 || newEventMilestones.length > 0) {
      const chatMessages = messages.filter(
        (message) => message.type === 'text' || message.type === 'image'
      );
      const celebrationsWithIcons = [
        ...newMessageMilestones.map((count) => ({
          kind: 'messages',
          count,
          icon: EVENT_ICONS[chatMessages[count - 1]?.type] ?? '💬'
        })),
        ...newEventMilestones.map((count) => ({
          kind: 'events',
          count,
          icon: EVENT_ICONS[eventMilestoneTypesRef.current.get(count)] ?? '✨'
        }))
      ];
      setEasterEggQueue((queue) => [
        ...queue,
        ...celebrationsWithIcons.map((celebration) => ({
          ...celebration,
          intensity:
            celebration.count <= 25
              ? 1
              : celebration.count <= 100
              ? 2
              : celebration.count <= 500
              ? 3
              : 4,
          revision: ++celebrationRevisionRef.current
        }))
      ]);
    }
  }, [messages, activityEventCount, eventMilestoneTypesRef]);

  const activeCelebration = easterEggQueue[0];
  const activeCelebrationRevision = activeCelebration?.revision;
  useEffect(() => {
    if (activeCelebrationRevision === undefined) return undefined;

    const timeout = window.setTimeout(() => setEasterEggQueue((queue) => queue.slice(1)), 7800);
    return () => window.clearTimeout(timeout);
  }, [activeCelebrationRevision]);

  // Dynamic Confetti Trigger on Easter Egg Milestones
  const activeCelebrationIntensity = activeCelebration?.intensity;
  const activeCelebrationIcon = activeCelebration?.icon;
  useEffect(() => {
    if (
      activeCelebrationIntensity === undefined ||
      !activeCelebrationIcon ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;

    let cancelled = false;
    let timer;

    import('canvas-confetti').then((module) => {
      if (cancelled) return;
      const confetti = module.default;
      const intensity = activeCelebrationIntensity;
      const iconShape = confetti.shapeFromText({
        text: activeCelebrationIcon,
        scalar: 1.4 + intensity * 0.12
      });
      const burst = (particleRatio, options) =>
        confetti({
          angle: options.angle,
          spread: options.spread,
          startVelocity: 34 + intensity * 6,
          decay: 0.9,
          gravity: 0.85,
          ticks: 180 + intensity * 50,
          particleCount: Math.round((18 + intensity * 18) * particleRatio),
          origin: { x: options.originX, y: 0.1 },
          colors: ['#a7f3d0', '#bfdbfe', '#fde68a', '#fbcfe8', '#ffffff'],
          scalar: 0.9 + intensity * 0.12,
          shapes: [iconShape]
        });

      burst(0.5, { angle: 60, spread: 55, originX: 0.12 });
      burst(0.5, { angle: 120, spread: 55, originX: 0.88 });
      if (intensity >= 3) {
        timer = window.setTimeout(() => {
          if (!cancelled) burst(0.35, { angle: 90, spread: 100, originX: 0.5 });
        }, 240);
      }
    });

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeCelebrationIcon, activeCelebrationIntensity, activeCelebrationRevision]);

  // Mobile Visual Viewport & Keyboard Handling
  useEffect(() => {
    const updateHeight = () => {
      const visualViewport = window.visualViewport;
      const height = visualViewport?.height || window.innerHeight;
      const offset = visualViewport ? Math.max(0, window.innerHeight - height) : 0;

      setViewportHeight(height);
      setKeyboardOffset(offset);
    };

    const resizeHandler = () => {
      updateHeight();
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resizeHandler);
      window.visualViewport.addEventListener('scroll', resizeHandler);
    } else {
      window.addEventListener('resize', resizeHandler);
    }

    updateHeight();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', resizeHandler);
        window.visualViewport.removeEventListener('scroll', resizeHandler);
      } else {
        window.removeEventListener('resize', resizeHandler);
      }
    };
  }, []);

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
    setIsFeedbackOpen(true);
  }, [clearFeedbackStatus, isUserConnected, sendMessage]);

  const handleCloseFeedback = useCallback(() => {
    setIsFeedbackOpen(false);
    clearFeedbackStatus();
  }, [clearFeedbackStatus]);

  const handleSubmitFeedback = useCallback(
    (feedback) => {
      sendFeedback(feedback);
    },
    [sendFeedback]
  );

  const handleCloseDonation = useCallback(() => {
    setIsDonationOpen(false);
  }, []);

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
          onOpenDonation={() => setIsDonationOpen(true)}
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

      {isFeedbackOpen && (
        <FeedbackModal
          status={feedbackStatus}
          onClose={handleCloseFeedback}
          onSubmit={handleSubmitFeedback}
        />
      )}

      {isDonationOpen && <DonationModal onClose={handleCloseDonation} />}

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
    <AdminConsole />
  ) : (
    <ChatApp />
  );

export default AnonyChat;
