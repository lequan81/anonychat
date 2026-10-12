import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍'];
const ACTIVITY_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
const EVENT_ICONS = {
  text: '💬',
  image: '🖼️',
  reaction: '💟',
  typing: '⌨️',
  receipt: '📬'
};

const getCelebrationMessage = ({ kind, count, intensity }) => {
  const messageIntros = ['Mới khởi động', 'Vào guồng rồi', 'Nhịp chat tăng tốc', 'Bùng nổ tin nhắn'];
  const eventIntros = ['Mới khởi động', 'Tăng nhịp rồi', 'Server nóng lên', 'Bùng nổ sự kiện'];
  const intro = (kind === 'messages' ? messageIntros : eventIntros)[intensity - 1];

  return kind === 'messages'
    ? `${intro} — hai bạn đã gửi ${count} tin nhắn cho nhau!`
    : `${intro} — hai bạn đã spam lên server ${count} sự kiện!`;
};

const EasterEggCelebration = ({ celebration }) => (
  <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
    <div className="easter-egg-toast-wrap absolute left-1/2 top-[6%]">
      <div className={`easter-egg-toast easter-egg-toast--${celebration.intensity} flex max-w-[calc(100vw-2rem)] items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-zinc-950/95 px-4 py-2 text-center text-xs text-emerald-100`}>
        <span className={`easter-egg-emoji easter-egg-emoji--${celebration.intensity}`} aria-hidden="true">
          {celebration.icon}
        </span>
        <span className="break-words">{getCelebrationMessage(celebration)}</span>
      </div>
    </div>
  </div>
);

const useAudio = () => {
  const audioRefs = useRef({
    connect: new Audio('/sounds/activity.mp3'),
    disconnect: new Audio('/sounds/activity.mp3'),
    send: new Audio('/sounds/message.mp3'),
    receive: new Audio('/sounds/message.mp3')
  });

  const playSound = useCallback((type) => {
    try {
      const audio = audioRefs.current[type];
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch((e) => console.log('Audio play failed:', e));
      }
    } catch (error) {
      console.log('Audio error:', error);
    }
  }, []);

  return { playSound };
};

const useWebSocket = (playSound) => {
  const [ws, setWs] = useState(null);
  const [isUserConnected, setIsUserConnected] = useState(false);
  const [hasActiveConversation, setHasActiveConversation] = useState(false);
  const [messages, setMessages] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [activityEventCount, setActivityEventCount] = useState(0);
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const activityEventCountRef = useRef(0);
  const eventMilestoneTypesRef = useRef(new Map());
  const typingTimeoutRef = useRef(null);
  const reconnectGraceRef = useRef(30);
  const nextMessageIndexRef = useRef(0);
  const imageTransfersRef = useRef(new Map());
  // Map<transferId, {totalChunks, totalBytes, messageId, messageIndex, chunks: Uint8Array[], received: number}>
  const blobUrlsRef = useRef([]);

  const recordActivityEvent = useCallback((type) => {
    const count = ++activityEventCountRef.current;
    if (ACTIVITY_MILESTONES.includes(count) || (count > 1000 && count % 1000 === 0)) {
      eventMilestoneTypesRef.current.set(count, type);
    }
    setActivityEventCount(count);
  }, []);

  useEffect(() => {
    const storageKey = 'anonychat-client-id';
    let clientId = window.localStorage.getItem(storageKey);
    if (!clientId) {
      clientId = window.crypto.randomUUID();
      window.localStorage.setItem(storageKey, clientId);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?clientId=${encodeURIComponent(clientId)}`;
    let websocket;
    let reconnectTimeout;
    let keepaliveInterval;
    let reconnectDelay = 500;
    let disposed = false;
    let hasLostConnection = false;
    let isReconnecting = false;

    // Application-level keepalive: send a ping every 20s so proxy (Traefik/Nginx)
    // doesn't close the idle WebSocket before the server's WS ping fires.
    const CLIENT_KEEPALIVE_MS = 20_000;

    const connect = () => {
      if (disposed) return;

      websocket = new WebSocket(wsUrl);
      websocket.binaryType = 'arraybuffer';

      websocket.onopen = () => {
        reconnectDelay = 500;
        setWs(websocket);
        hasLostConnection = false;
        setMessages((prev) => prev.map((message) => (
          message.reconnectSeconds && !message.reconnectEndedAt
            ? { ...message, reconnectEndedAt: Date.now() }
            : message
        )));

        // Start application-level keepalive to prevent proxy idle-timeout
        window.clearInterval(keepaliveInterval);
        keepaliveInterval = window.setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'ping' }));
          }
        }, CLIENT_KEEPALIVE_MS);
      };

      websocket.onmessage = (event) => {
        // Handle binary frames (image chunks from server relay)
        if (event.data instanceof ArrayBuffer) {
          const buffer = event.data;
          const HEADER = 40;
          if (buffer.byteLength < HEADER) return;

          const bytes = new Uint8Array(buffer, 0, 36);
          let transferId = '';
          for (let i = 0; i < 36; i++) transferId += String.fromCharCode(bytes[i]);

          const view = new DataView(buffer);
          const chunkIndex = view.getUint32(36, false);

          const transfer = imageTransfersRef.current.get(transferId);
          if (!transfer || chunkIndex >= transfer.totalChunks || transfer.chunks[chunkIndex]) return;

          transfer.chunks[chunkIndex] = new Uint8Array(buffer, HEADER);
          transfer.received++;

          const progress = Math.round((transfer.received / transfer.totalChunks) * 100);
          setMessages((prev) => prev.map((m) =>
            m.imageTransferId === transferId ? { ...m, imageProgress: progress } : m
          ));

          if (transfer.received >= transfer.totalChunks) {
            // Assemble all chunks into a single Uint8Array
            let totalSize = 0;
            for (const chunk of transfer.chunks) totalSize += chunk.length;
            const assembled = new Uint8Array(totalSize);
            let offset = 0;
            for (const chunk of transfer.chunks) { assembled.set(chunk, offset); offset += chunk.length; }

            imageTransfersRef.current.delete(transferId);

            const blob = new Blob([assembled], { type: 'image/jpeg' });
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(blobUrl);

            recordActivityEvent('image');
            playSound('receive');

            setMessages((prev) => prev.map((m) =>
              m.imageTransferId === transferId
                ? { ...m, data: blobUrl, imageProgress: undefined, imageTransferId: undefined, delivered: true }
                : m
            ));

            // Send delivery receipt
            if (transfer.messageId && websocket.readyState === WebSocket.OPEN) {
              websocket.send(JSON.stringify({ type: 'receipt', messageId: transfer.messageId }));
              recordActivityEvent('receipt');
            }
          }
          return;
        }

        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          msg = { system: event.data };
        }

        if (msg.type === 'config' && Number.isInteger(msg.reconnectGraceSeconds) && msg.reconnectGraceSeconds > 0) {
          reconnectGraceRef.current = msg.reconnectGraceSeconds;
        }

        if (msg.type === 'image_start') {
          const { id, messageId, messageIndex, totalChunks, totalBytes } = msg;
          if (!id || !Number.isSafeInteger(totalChunks) || totalChunks < 1) return;

          imageTransfersRef.current.set(id, {
            totalChunks,
            totalBytes,
            messageId: typeof messageId === 'string' ? messageId : null,
            chunks: new Array(totalChunks).fill(null),
            received: 0
          });

          const msgIndex = Number.isSafeInteger(messageIndex) ? messageIndex : nextMessageIndexRef.current++;
          setMessages((prev) => [
            ...prev.filter((item) => item.type !== 'typing'),
            {
              id: typeof messageId === 'string' ? messageId : `img_transfer_${id}`,
              index: msgIndex,
              originIndex: Number.isSafeInteger(messageIndex) ? messageIndex : null,
              author: 'peer',
              type: 'image',
              data: null,
              from: 'stranger',
              isMine: false,
              delivered: false,
              reactions: { self: null, peer: null },
              timestamp: Date.now(),
              imageProgress: 0,
              imageTransferId: id
            }
          ]);
          return;
        }

        if (msg.type === 'image_cancel') {
          const { id } = msg;
          imageTransfersRef.current.delete(id);
          setMessages((prev) => prev.map((m) =>
            m.imageTransferId === id ? { ...m, imageFailed: true, imageProgress: undefined, imageTransferId: undefined } : m
          ));
          return;
        }

        if (msg.type === 'announcement' && typeof msg.message === 'string') {
          setMessages((prev) => [
            ...prev.filter((item) => item.type !== 'typing'),
            { announcement: msg.message, timestamp: Date.now() }
          ]);
          return;
        }

        if (msg.type === 'stats' && msg.onlineCount !== undefined) {
          setOnlineCount(msg.onlineCount);
        }

        if (msg.type === 'feedbackResult') {
          setFeedbackStatus({
            type: msg.ok === true ? 'success' : 'error',
            message: typeof msg.message === 'string' ? msg.message : 'Không nhận được phản hồi từ server.'
          });
          return;
        }

        if (msg.type === 'receipt') {
          recordActivityEvent('receipt');
          setMessages((prev) => prev.map((m) => (m.id === msg.messageId ? { ...m, delivered: true } : m)));
          return;
        }

        if (msg.type === 'reaction') {
          if (
            !Number.isSafeInteger(msg.messageIndex)
            || (msg.author !== 'self' && msg.author !== 'peer')
            || (msg.emoji !== null && !REACTION_EMOJIS.includes(msg.emoji))
          ) {
            return;
          }
          recordActivityEvent('reaction');
          const targetAuthor = msg.author === 'self' ? 'peer' : 'self';
          setMessages((prev) => prev.map((message) => (
            message.originIndex === msg.messageIndex && message.author === targetAuthor
              ? {
                ...message,
                reactions: { ...message.reactions, peer: msg.emoji },
                reactionAnimation: {
                  emoji: msg.emoji ?? message.reactions.peer,
                  revision: (message.reactionAnimation?.revision ?? 0) + 1
                }
              }
              : message
          )));
          return;
        }

        if (msg.system?.includes('Connected to a stranger')) {
          setIsUserConnected(true);
          setHasActiveConversation(true);
          if (!isReconnecting) {
            setMessages([]);
            nextMessageIndexRef.current = 0;
            setActivityEventCount(0);
            activityEventCountRef.current = 0;
            eventMilestoneTypesRef.current.clear();
          }
          isReconnecting = false;
          playSound('connect');
        }

        if (msg.system?.toLowerCase().includes('reconnected')) {
          setIsUserConnected(true);
          setHasActiveConversation(true);
          isReconnecting = false;
        }

        if (msg.system?.includes('Waiting for a stranger') || msg.system?.includes('No partner available')) {
          setIsUserConnected(false);
          setHasActiveConversation(false);
          if (msg.system.includes('Waiting for a stranger')) {
            isReconnecting = false;
          }
        }

        if (msg.system?.toLowerCase().includes('conversation ended')) {
          setIsUserConnected(false);
          setHasActiveConversation(false);
          isReconnecting = false;
        }

        if (msg.system?.toLowerCase().includes('connection lost')) {
          setIsUserConnected(false);
        }

        if (msg.system?.includes('disconnected')) {
          setIsUserConnected(false);
          setHasActiveConversation(false);
          playSound('disconnect');
        }

        if (msg.type === 'text' || msg.type === 'image') {
          if (msg.from === 'stranger') {
            recordActivityEvent(msg.type);
          }
          const soundType = msg.from === 'self' ? 'send' : 'receive';
          playSound(soundType);

          const incomingMessage = {
            id: msg.id,
            index: msg.from === 'self' && Number.isSafeInteger(msg.messageIndex)
              ? msg.messageIndex
              : nextMessageIndexRef.current++,
            originIndex: Number.isSafeInteger(msg.messageIndex) ? msg.messageIndex : null,
            author: msg.from === 'self' ? 'self' : 'peer',
            type: msg.type,
            data: msg.data,
            from: msg.from,
            isMine: msg.from === 'self',
            delivered: msg.from === 'self' ? false : true,
            reactions: { self: null, peer: null },
            timestamp: Date.now()
          };

          if (msg.from === 'stranger' && msg.id && websocket.readyState === WebSocket.OPEN) {
            websocket.send(
              JSON.stringify({
                type: 'receipt',
                messageId: msg.id
              })
            );
            recordActivityEvent('receipt');
          }

          window.clearTimeout(typingTimeoutRef.current);

          setMessages((prev) => [
            ...prev.filter((item) => item.type !== 'typing'),
            incomingMessage
          ]);
        }

        if (msg.type === 'typing') {
          recordActivityEvent('typing');
          window.clearTimeout(typingTimeoutRef.current);
          setMessages((prev) => (
            prev.some((item) => item.type === 'typing')
              ? prev
              : [...prev, { id: 'typing-indicator', type: 'typing', timestamp: Date.now() }]
          ));
          typingTimeoutRef.current = window.setTimeout(() => {
            setMessages((prev) => prev.filter((item) => item.type !== 'typing'));
          }, 2000);
        }

        if (msg.system) {
          const isReconnect = msg.system.toLowerCase().includes('reconnected')
            || msg.system.toLowerCase().includes('connection restored');
          setMessages((prev) => [
            ...prev.map((message) => (
              isReconnect && message.reconnectSeconds && !message.reconnectEndedAt
                ? { ...message, reconnectEndedAt: Date.now() }
                : message
            )),
            {
              system: msg.system,
              timestamp: Date.now(),
              reconnectSeconds: Number.isInteger(msg.reconnectSeconds) && msg.reconnectSeconds > 0
                ? msg.reconnectSeconds
                : undefined,
              reconnectStartedAt: Number.isInteger(msg.reconnectSeconds) && msg.reconnectSeconds > 0
                ? Date.now()
                : undefined
            }
          ]);
        }
      };

      websocket.onclose = (event) => {
        if (disposed) return;

        window.clearInterval(keepaliveInterval);
        setWs(null);
        setIsUserConnected(false);
        if (event.code === 4001 && event.reason === 'Reconnected from this client') {
          setMessages((prev) => [
            ...prev,
            {
              system: '[SYSTEM] Phiên chat đã được tiếp tục ở một kết nối khác.',
              timestamp: Date.now()
            }
          ]);
          return;
        }

        isReconnecting = true;
        if (!hasLostConnection) {
          hasLostConnection = true;
          setMessages((prev) => [
            ...prev,
            {
              system: '[SYSTEM] Connection lost. Retrying…',
              timestamp: Date.now(),
              reconnectSeconds: reconnectGraceRef.current,
              reconnectStartedAt: Date.now()
            }
          ]);
        }
        reconnectTimeout = window.setTimeout(() => {
          connect();
        }, reconnectDelay);
        // Cap at 5s (not 10s) so we reconnect within the 120s server grace window
        reconnectDelay = Math.min(reconnectDelay * 2, 5000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        websocket.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimeout);
      window.clearInterval(keepaliveInterval);
      window.clearTimeout(typingTimeoutRef.current);
      if (websocket && websocket.readyState !== WebSocket.CLOSING && websocket.readyState !== WebSocket.CLOSED) {
        websocket.close();
      }
    };
  }, [playSound, recordActivityEvent]);

  const sendMessage = (data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (data.type === 'text' || data.type === 'image') {
        const messageIndex = nextMessageIndexRef.current++;
        ws.send(JSON.stringify({ ...data, messageIndex }));
        recordActivityEvent(data.type);
      } else {
        ws.send(JSON.stringify(data));
        if (data.type === 'typing') {
          recordActivityEvent('typing');
        }
      }
    }
  };

  const sendReaction = (targetMessage, emoji) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'reaction',
        messageIndex: targetMessage.originIndex,
        author: targetMessage.author,
        emoji
      }));
      recordActivityEvent('reaction');
      setMessages((prev) => prev.map((message) => (
        message.index === targetMessage.index
          ? {
            ...message,
            reactions: { ...message.reactions, self: emoji },
            reactionAnimation: {
              emoji: emoji ?? message.reactions.self,
              revision: (message.reactionAnimation?.revision ?? 0) + 1
            }
          }
          : message
      )));
      return true;
    }
    return false;
  };

  const sendFeedback = useCallback(({ feedback, username }) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setFeedbackStatus({ type: 'error', message: 'Chưa kết nối được server. Bạn thử lại sau nhé.' });
      return false;
    }
    ws.send(JSON.stringify({ type: 'feedback', data: feedback, username }));
    setFeedbackStatus({ type: 'pending', message: 'Đang gửi góp ý…' });
    return true;
  }, [ws]);

  const clearFeedbackStatus = useCallback(() => setFeedbackStatus(null), []);

  return {
    isUserConnected,
    hasActiveConversation,
    messages,
    sendMessage,
    sendReaction,
    sendFeedback,
    feedbackStatus,
    clearFeedbackStatus,
    onlineCount,
    activityEventCount,
    eventMilestoneTypesRef
  };
};

const ChatMessage = ({
  message,
  image,
  isMine,
  delivered,
  reactions,
  reactionAnimation,
  index,
  originIndex,
  author,
  onReact
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedReaction = reactions?.self ?? null;
  const ownReaction = reactions?.self ?? null;
  const peerReaction = reactions?.peer ?? null;

  const handleReaction = (emoji) => {
    const sent = onReact({ index, originIndex, author }, emoji);
    if (sent) setPickerOpen(false);
  };

  return (
    <div className={`flex w-full items-start ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`group relative w-fit max-w-[82%] ${(ownReaction || peerReaction) ? 'pb-5' : ''} ${isMine ? 'text-right' : 'text-left'}`}>
        <div
          className={`absolute -top-10 z-10 flex items-center gap-1 rounded-full border border-zinc-700/80 bg-zinc-950 p-1 shadow-[0_4px_16px_rgba(0,0,0,0.35)] opacity-0 pointer-events-none transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${isMine ? 'right-0' : 'left-0'} ${pickerOpen ? 'pointer-events-auto opacity-100' : ''}`}
          role="group"
          aria-label="Chọn cảm xúc"
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Phản ứng ${emoji}`}
              aria-pressed={selectedReaction === emoji}
              onClick={() => handleReaction(emoji)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-base transition-colors hover:bg-zinc-800 ${selectedReaction === emoji ? 'bg-zinc-800' : ''}`}
            >
              {emoji}
            </button>
          ))}
          {selectedReaction && (
            <button
              type="button"
              aria-label="Bỏ reaction"
              onClick={() => handleReaction(null)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Chạm hoặc nhấn Enter để chọn cảm xúc"
          onClick={() => setPickerOpen(true)}
          className={`animate-chat-message ${isMine ? 'origin-bottom-right' : 'origin-bottom-left'} w-fit max-w-full break-words rounded-[1.35rem] border px-3 py-2.5 text-sm leading-relaxed transition-colors duration-200 ${isMine
            ? delivered
              ? 'ml-auto border-emerald-500/20 bg-emerald-500/[0.035] text-zinc-100'
              : 'ml-auto border-amber-500/25 bg-amber-500/[0.06] text-zinc-100'
            : 'mr-auto border-zinc-800 bg-zinc-900/50 text-zinc-100'
            }`}
        >
          {image ? (
            <img
              src={image}
              alt="Ảnh được gửi trong cuộc trò chuyện"
              className="max-h-80 max-w-full rounded-lg object-contain"
            />
          ) : (
            <span className="block whitespace-pre-wrap text-left">{message}</span>
          )}
        </button>
        {peerReaction && (
          <div className={`absolute ${isMine ? '-left-3' : '-right-3'} -top-3 z-10 flex h-9 w-9 items-center justify-center text-2xl`} aria-label="Reaction của người chat cùng">
            <span className="rotate-12">
              <span
                key={`peer-${reactionAnimation?.emoji === peerReaction ? reactionAnimation.revision : 0}`}
                className={reactionAnimation?.emoji === peerReaction ? 'animate-reaction-spring inline-block' : 'inline-block'}
              >
                {peerReaction}
              </span>
            </span>
          </div>
        )}
        {ownReaction && (
          <button
            type="button"
            aria-label={`${ownReaction} reaction của bạn, bỏ reaction`}
            aria-pressed="true"
            onClick={() => onReact({ index, originIndex, author }, null)}
            className={`absolute -bottom-1 ${isMine ? '-right-2' : '-left-2'} z-10 inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-2xl`}
            title="Bỏ reaction của bạn"
          >
            <span className="-rotate-12">
              <span
                key={`self-${reactionAnimation?.emoji === ownReaction ? reactionAnimation.revision : 0}`}
                className={reactionAnimation?.emoji === ownReaction ? 'animate-reaction-spring inline-block' : 'inline-block'}
              >
                {ownReaction}
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

const SystemMessage = ({ message }) => {
  const normalizedMessage = message.system.toLowerCase();
  const hasCountdown = Number.isInteger(message.reconnectSeconds) && message.reconnectSeconds > 0;
  const countdownStartedAt = message.reconnectStartedAt || message.timestamp;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!hasCountdown || message.reconnectEndedAt) return undefined;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasCountdown, message.reconnectEndedAt]);

  const remainingSeconds = Math.max(
    0,
    Math.ceil((countdownStartedAt + message.reconnectSeconds * 1000 - now) / 1000)
  );
  const countdownActive = hasCountdown && !message.reconnectEndedAt && remainingSeconds > 0;
  const isConnected = normalizedMessage.includes('connected to a stranger')
    || normalizedMessage.includes('reconnected')
    || normalizedMessage.includes('connection restored')
    || normalizedMessage.includes('connection established');
  const isReconnecting = normalizedMessage.includes('connection lost');
  const dotStyle = isConnected
    ? 'bg-emerald-300'
    : isReconnecting
      ? 'bg-amber-300'
      : 'bg-zinc-500';
  const textStyle = isConnected
    ? 'text-emerald-200/80'
    : isReconnecting
      ? 'text-amber-200/80'
      : 'text-zinc-500';
  const label = normalizedMessage.includes('connection restored')
    ? 'Đã kết nối lại với máy chủ'
    : normalizedMessage.includes('conversation ended')
      ? 'Đã kết thúc · Đang tìm người mới'
      : normalizedMessage.includes('connection lost. retrying')
        ? 'Đang kết nối lại với máy chủ'
        : normalizedMessage.includes('connection lost')
          ? 'Người lạ mất kết nối · Đang thử lại'
          : normalizedMessage.includes('reconnected to your stranger')
            ? 'Đã kết nối lại'
            : normalizedMessage.includes('stranger reconnected')
              ? 'Người lạ đã kết nối lại'
              : normalizedMessage.includes('connected to a stranger')
                ? 'Đã kết nối'
                : normalizedMessage.includes('stranger disconnected')
                  ? 'Đã ngắt kết nối'
                  : normalizedMessage.includes('waiting for a stranger')
                    ? 'Đang chờ người lạ'
                    : message.system.replace(/^\[SYSTEM\]\s*/i, '');

  return (
    <div className="my-2 flex items-center gap-2.5 py-1" role="status">
      <span className="h-px flex-1 bg-zinc-800/80" />
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotStyle} ${countdownActive ? 'motion-safe:animate-pulse' : ''}`} />
      <span className={`text-center text-[9px] font-medium tracking-wide ${textStyle}`}>
        {label}
        {hasCountdown && !message.reconnectEndedAt ? ` · ${remainingSeconds}s` : ''}
      </span>
      <span className="h-px flex-1 bg-zinc-800/80" />
    </div>
  );
};

const TypingBubble = () => (
  <div
    className="mr-auto flex w-fit items-center gap-1.5 rounded-[1.35rem] border border-zinc-800 bg-zinc-900/50 px-4 py-3"
    role="status"
    aria-label="Người lạ đang nhập"
  >
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]" />
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]" />
  </div>
);

const OnlineCounter = ({ count }) => {
  const [prevCount, setPrevCount] = useState(count);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (count !== prevCount) {
      setIsAnimating(true);
      const timer = window.setTimeout(() => {
        setIsAnimating(false);
        setPrevCount(count);
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [count, prevCount]);

  return (
    <div
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-300 transition-all duration-300 sm:gap-2 sm:text-[10px] sm:tracking-[0.12em] ${isAnimating ? 'scale-[1.02]' : 'scale-100'
        }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {count ?? 0} online
    </div>
  );
};

const ChatLog = ({ messages, isUserConnected, onReact }) => {
  const logRef = useRef(null);

  useLayoutEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, isUserConnected]);

  return (
    <div
      ref={logRef}
      className="relative min-h-0 flex-1 overflow-y-auto rounded-[1.5rem] border border-zinc-800/80 bg-[#0a0a0b] p-3 md:p-4"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.14) transparent'
      }}
    >
      {messages.length === 0 ? (
        <div className="flex h-full min-h-[220px] items-center justify-center p-4 text-center">
          <div className="max-w-xs">
            <h2 className="mt-3 text-lg font-medium text-zinc-100">
              {isUserConnected ? 'Bạn đang ở trong phòng.' : 'Đang chờ người lạ...'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {isUserConnected
                ? 'Hãy chào hỏi và giữ cuộc trò chuyện .'
                : 'Bạn sẽ có thể chat khi có ai đó tham gia.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg, idx) => (
            <div key={msg.index ?? msg.id ?? `${msg.timestamp}-${idx}`}>
              {msg.announcement ? (
                <>
                  <SystemMessage message={{ system: `[ADMIN] ${msg.announcement}`, timestamp: msg.timestamp }} />
                  <SystemMessage message={{ system: 'Admin chỉ gửi thông báo này và không thể biết bạn đang nhắn gì.', timestamp: msg.timestamp }} />
                </>
              ) : msg.system ? (
                <SystemMessage message={msg} />
              ) : msg.type === 'typing' ? (
                <TypingBubble />
              ) : (
                <ChatMessage
                  message={msg.data}
                  image={msg.type === 'image' ? msg.data : null}
                  isMine={msg.isMine}
                  delivered={msg.delivered}
                  reactions={msg.reactions}
                  reactionAnimation={msg.reactionAnimation}
                  index={msg.index}
                  originIndex={msg.originIndex}
                  author={msg.author}
                  onReact={onReact}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MessageInput = ({ onSendMessage, onTyping, onOpenAdmin, isConnected }) => {
  const [message, setMessage] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [message]);

  const handleTyping = () => {
    if (!isConnected) return;
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping();
    }, 300);
  };

  const submitMessage = () => {
    if (!message.trim() || !isConnected) return;
    if (message.trim().toLowerCase() === '/admin') {
      setMessage('');
      onOpenAdmin();
      return;
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    onSendMessage({
      type: 'text',
      data: message,
      id: messageId
    });
    setMessage('');
  };

  const processImage = async (file) => {
    setAttachmentError('');
    if (!file) return;
    if (!isConnected || isProcessingImage) return;

    if (!file.type.startsWith('image/')) {
      setAttachmentError('Chỉ hỗ trợ tệp hình ảnh.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setAttachmentError('Ảnh gốc phải nhỏ hơn 20 MB.');
      return;
    }

    setIsProcessingImage(true);
    let bitmap;

    try {
      bitmap = await createImageBitmap(file);
      const longestSide = Math.max(bitmap.width, bitmap.height);
      const scale = Math.min(1, 1600 / longestSide);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context is unavailable');

      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => result ? resolve(result) : reject(new Error('Image encoding failed')),
          'image/jpeg',
          0.82
        );
      });

      if (blob.size > 5 * 1024 * 1024) {
        throw new Error('Ảnh sau khi nén vẫn vượt quá 5 MB.');
      }

      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Image reading failed'));
        reader.readAsDataURL(blob);
      });
      if (typeof data !== 'string') {
        throw new Error('Image encoding did not produce a data URL');
      }

      onSendMessage({
        type: 'image',
        data,
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      });
    } catch (error) {
      console.error('Image processing failed:', error);
      setAttachmentError(error.message || 'Không thể xử lý ảnh này.');
    } finally {
      bitmap?.close();
      setIsProcessingImage(false);
    }
  };

  const handleImageSelected = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    processImage(file);
  };

  const handlePaste = (event) => {
    const clipboardItems = Array.from(event.clipboardData.items);
    const imageItem = clipboardItems.find((item) => item.type.startsWith('image/'));
    const imageFile = imageItem?.getAsFile()
      || Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'));

    if (!imageFile) return;

    event.preventDefault();
    processImage(imageFile);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  return (
    <div className="shrink-0 space-y-2">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleImageSelected}
        tabIndex={-1}
        aria-label="Chọn hình ảnh"
      />
      <div className="flex items-center gap-2 rounded-[1.5rem] border border-zinc-800/80 bg-[#0a0a0b] p-2 transition-all duration-200 focus-within:ring-1 focus-within:ring-zinc-700/80 md:p-3">
        <textarea
          ref={inputRef}
          rows={1}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="max-h-[120px] min-h-[40px] flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-2 text-sm leading-6 text-zinc-50 placeholder:text-zinc-500 focus:outline-none disabled:cursor-not-allowed"
          placeholder={isConnected ? 'Nhập tin nhắn hoặc dán ảnh...' : 'Đang kết nối...'}
          autoComplete="off"
          autoFocus
          disabled={!isConnected}
        />
        {isConnected ? (
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isProcessingImage}
            className="inline-flex items-center justify-center rounded-full p-2.5 text-zinc-400 transition-all duration-200 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
            aria-label="Gửi hình ảnh"
            title="Chọn ảnh hoặc dán ảnh bằng Ctrl+V"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M21 11.5 12.5 20a5 5 0 0 1-7.1-7.1l9.2-9.2a3.3 3.3 0 0 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="shrink-0 rounded-lg px-2 py-2 text-[10px] text-zinc-400/70 transition-colors hover:bg-zinc-800/70 hover:text-zinc-200 active:scale-[0.98]"
          >
            chửi admin
          </button>
        )}
        <button
          type="button"
          onClick={submitMessage}
          disabled={!isConnected || !message.trim()}
          className="inline-flex items-center justify-center rounded-full bg-zinc-100 p-2.5 text-zinc-900 transition-all duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
          aria-label="Gửi tin nhắn"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M5 12h12" />
            <path d="M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      {(attachmentError || isProcessingImage) && (
        <p className="px-2 text-[10px] text-zinc-400" role={attachmentError ? 'alert' : 'status'}>
          {attachmentError || 'Đang chuẩn bị hình ảnh…'}
        </p>
      )}
    </div>
  );
};

const FeedbackModal = ({ status, onClose, onSubmit }) => {
  const [feedback, setFeedback] = useState('');
  const [username, setUsername] = useState('');
  const textareaRef = useRef(null);
  const isPending = status?.type === 'pending';
  const isSent = status?.type === 'success';

  useEffect(() => {
    textareaRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isPending) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onClose]);

  const submit = (event) => {
    event.preventDefault();
    if (!feedback.trim() || isPending || isSent) return;
    onSubmit({ feedback: feedback.trim(), username: username.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-[#111214] p-5 shadow-[0_12px_48px_rgba(0,0,0,0.35)]"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="feedback-title" className="text-sm font-semibold text-zinc-100">Góp ý với admin</h2>
            <p className="mt-1 text-xs text-zinc-500">Tin nhắn sẽ được gửi ẩn danh.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md px-2 py-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value.slice(0, 2000))}
          maxLength={2000}
          rows={5}
          disabled={isPending || isSent}
          placeholder="Bạn muốn góp ý điều gì?"
          className="w-full resize-y rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-60"
        />
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value.slice(0, 80))}
          maxLength={80}
          disabled={isPending || isSent}
          placeholder="Tên của bạn (không bắt buộc)"
          aria-label="Tên của bạn (không bắt buộc)"
          className="mt-3 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p
            className={`text-xs ${status?.type === 'error' ? 'text-rose-300' : status?.type === 'success' ? 'text-emerald-300' : 'text-zinc-500'}`}
            role={status?.type === 'error' ? 'alert' : 'status'}
          >
            {status?.message || `${feedback.length}/2000`}
          </p>
          <button
            type="submit"
            disabled={!feedback.trim() || isPending || isSent}
            className="shrink-0 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? 'Đang gửi…' : isSent ? 'Đã gửi' : 'Gửi góp ý'}
          </button>
        </div>
      </form>
    </div>
  );
};

const DonationModal = ({ onClose }) => {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedElement instanceof HTMLElement) {
        previouslyFocusedElement.focus();
      }
    };
  }, [onClose]);

  return (
    <div
      className="donation-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="donation-title"
        aria-describedby="donation-description"
        className="donation-modal-card relative w-full max-w-sm rounded-[1.75rem] border border-zinc-700/70 bg-[#111214] p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.5)] sm:p-6"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
          aria-label="Đóng cửa sổ ủng hộ"
        >
          ×
        </button>
        <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-400/10 text-rose-300">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M12 21s-8.25-4.73-8.25-11.06A4.69 4.69 0 0 1 12 7.26a4.69 4.69 0 0 1 8.25 2.68C20.25 16.27 12 21 12 21Z" />
          </svg>
        </div>
        <h2 id="donation-title" className="text-base font-semibold text-zinc-100">
          Ủng hộ AnonyChat
        </h2>
        <p id="donation-description" className="mx-auto mt-1.5 max-w-[17rem] text-xs leading-relaxed text-zinc-400">
          Quét mã QR bằng ứng dụng ngân hàng để gửi một chút yêu thương.
        </p>
        <div className="mx-auto mt-5 w-full max-w-[18rem] overflow-hidden rounded-2xl bg-white p-2.5">
          <img
            src="/donate-qr-crop.jpg"
            alt="Mã QR VietQR để chuyển khoản qua ngân hàng MB"
            className="block aspect-square w-full rounded-xl object-cover"
          />
        </div>
        <p className="mt-3 text-[10px] tracking-wide text-zinc-500">
          Cảm ơn bạn đã đồng hành 💗
        </p>
      </section>
    </div>
  );
};

const ChatHeader = ({ onlineCount, hasActiveConversation, isUserConnected, onEndConversation, onOpenDonation }) => (
  <div className="flex shrink-0 items-center justify-between gap-1.5 rounded-[1.05rem] border border-zinc-800/80 bg-[#111214]/80 px-2.5 py-2.5 sm:gap-2 md:px-4 md:py-3">
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${isUserConnected ? 'bg-emerald-400' : 'bg-zinc-500'}`}
        role="status"
        aria-label={isUserConnected ? 'Đã kết nối' : 'Đang tìm người chat'}
      />
      <p className="whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-500 sm:text-[10px] sm:tracking-[0.12em]">anonychat</p>
      <button
        type="button"
        onClick={onOpenDonation}
        className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-full border border-rose-300/20 bg-rose-400/10 px-2 text-[10px] font-medium text-rose-200 transition-colors hover:border-rose-300/40 hover:bg-rose-400/20 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
        aria-label="Ủng hộ AnonyChat"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M12 21s-8.25-4.73-8.25-11.06A4.69 4.69 0 0 1 12 7.26a4.69 4.69 0 0 1 8.25 2.68C20.25 16.27 12 21 12 21Z" />
        </svg>
        <span className="hidden min-[380px]:inline">Ủng hộ</span>
      </button>
    </div>
    <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-2">
      <OnlineCounter count={onlineCount} />
      {hasActiveConversation && (
        <button
          type="button"
          onClick={onEndConversation}
          className="min-h-7 shrink-0 whitespace-nowrap rounded-full border border-rose-400/30 bg-rose-950/30 px-1.5 py-1 text-[9px] font-medium leading-none text-rose-200/80 transition-colors hover:border-rose-300/50 hover:bg-rose-900/40 hover:text-rose-100 sm:min-h-9 sm:px-2 sm:text-[10px]"
        >
          Thoát
        </button>
      )}
    </div>
  </div>
);

const ChatContainer = ({ children }) => (
  <div className="relative h-full min-h-0 w-full max-w-none rounded-none bg-[#0b0b0d] p-0 xl:max-w-xl xl:rounded-[1.6rem] xl:p-2">
    <div className="relative flex h-full min-h-0 flex-col gap-2 md:gap-3">{children}</div>
  </div>
);

const ChatApp = () => {
  const { playSound } = useAudio();
  const {
    isUserConnected,
    hasActiveConversation,
    messages,
    sendMessage,
    sendReaction,
    onlineCount,
    activityEventCount,
    eventMilestoneTypesRef,
    sendFeedback,
    feedbackStatus,
    clearFeedbackStatus
  } = useWebSocket(playSound);

  useEffect(() => {
    const pageTitle = 'AnonyChat | Anonymous Chat with Strangers Online';
    const pageDescription = 'AnonyChat is a free anonymous chat app for one-on-one stranger conversations and instant online messaging. Trò chuyện ẩn danh miễn phí với người lạ trực tuyến và gửi tin nhắn riêng tư ngay tức thì.';
    const pageKeywords = 'anonymous chat, random chat, stranger chat, online chat, private chat, trò chuyện ẩn danh, chat với người lạ, chat trực tuyến, tin nhắn ẩn danh';

    document.title = pageTitle;

    const setMeta = (selector, content) => {
      let element = document.head.querySelector(selector);
      if (!element) {
        element = document.createElement('meta');
        if (selector.startsWith('meta[name=')) {
          const attributeName = selector.match(/meta\[name="([^"]+)"\]/)?.[1];
          if (attributeName) {
            element.setAttribute('name', attributeName);
          }
        } else if (selector.startsWith('meta[property=')) {
          const attributeName = selector.match(/meta\[property="([^"]+)"\]/)?.[1];
          if (attributeName) {
            element.setAttribute('property', attributeName);
          }
        }
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    setMeta('meta[name="description"]', pageDescription);
    setMeta('meta[name="keywords"]', pageKeywords);
    setMeta('meta[property="og:title"]', pageTitle);
    setMeta('meta[property="og:description"]', pageDescription);
  }, []);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isDonationOpen, setIsDonationOpen] = useState(false);
  const [easterEggQueue, setEasterEggQueue] = useState([]);
  const lastCelebratedMilestonesRef = useRef({ messages: 0, events: 0 });
  const celebrationRevisionRef = useRef(0);

  useEffect(() => {
    const messageCount = messages.filter((message) => (
      message.type === 'text' || message.type === 'image'
    )).length;
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
      const milestones = ACTIVITY_MILESTONES.filter((value) => (
        value > previousCount && value <= currentCount
      ));
      if (currentCount > 1000) {
        for (let value = Math.max(2000, Math.ceil((previousCount + 1) / 1000) * 1000); value <= currentCount; value += 1000) {
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
      const chatMessages = messages.filter((message) => (
        message.type === 'text' || message.type === 'image'
      ));
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
          intensity: celebration.count <= 25 ? 1 : celebration.count <= 100 ? 2 : celebration.count <= 500 ? 3 : 4,
          revision: ++celebrationRevisionRef.current
        }))
      ])
    }
  }, [messages, activityEventCount, eventMilestoneTypesRef]);

  const activeCelebration = easterEggQueue[0];
  const activeCelebrationRevision = activeCelebration?.revision;
  useEffect(() => {
    if (activeCelebrationRevision === undefined) return undefined;

    const timeout = window.setTimeout(() => setEasterEggQueue((queue) => queue.slice(1)), 7800);
    return () => window.clearTimeout(timeout);
  }, [activeCelebrationRevision]);

  const activeCelebrationIntensity = activeCelebration?.intensity;
  const activeCelebrationIcon = activeCelebration?.icon;
  useEffect(() => {
    if (
      activeCelebrationIntensity === undefined
      || !activeCelebrationIcon
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return;

    const intensity = activeCelebrationIntensity;
    const iconShape = confetti.shapeFromText({
      text: activeCelebrationIcon,
      scalar: 1.4 + intensity * 0.12
    });
    const burst = (particleRatio, options) => confetti({
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
      const secondBurst = window.setTimeout(() => {
        burst(0.35, { angle: 90, spread: 100, originX: 0.5 });
      }, 240);
      return () => window.clearTimeout(secondBurst);
    }
    return undefined;
  }, [activeCelebrationIcon, activeCelebrationIntensity, activeCelebrationRevision]);

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

  const handleSendMessage = (data) => {
    sendMessage(data);
  };

  const handleTyping = () => {
    if (isUserConnected) {
      sendMessage({ type: 'typing' });
    }
  };

  const handleEndConversation = () => {
    sendMessage({ type: 'endConversation' });
  };

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

  const handleSubmitFeedback = useCallback((feedback) => {
    sendFeedback(feedback);
  }, [sendFeedback]);

  const handleCloseDonation = useCallback(() => {
    setIsDonationOpen(false);
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-0 flex items-center justify-center overflow-hidden bg-[#08090b] px-1 py-3 text-zinc-100 md:px-2 md:py-8 xl:px-8"
      style={{
        fontFamily: 'Maple Mono, monospace',
        height: `${viewportHeight}px`,
        paddingBottom: keyboardOffset > 0 ? 'max(0.75rem, env(safe-area-inset-bottom))' : undefined,
        paddingTop: keyboardOffset > 0 ? 'max(0.75rem, env(safe-area-inset-top))' : undefined,
        justifyContent: keyboardOffset > 0 ? 'flex-start' : 'center'
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:18px_18px]" />

      {activeCelebration && (
        <EasterEggCelebration
          key={activeCelebration.revision}
          celebration={activeCelebration}
        />
      )}

      <div className="sr-only" aria-live="polite">
        <h1>AnonyChat</h1>
        <p>Anonymous chat with strangers online, private one-to-one conversations, real-time messaging, and instant matching.</p>
        <p>Trò chuyện ẩn danh với người lạ trực tuyến, cuộc trò chuyện riêng tư theo cặp, nhắn tin thời gian thực và ghép cặp tức thì.</p>
      </div>

      <ChatContainer>
        <ChatHeader
          onlineCount={onlineCount}
          hasActiveConversation={hasActiveConversation}
          isUserConnected={isUserConnected}
          onEndConversation={handleEndConversation}
          onOpenDonation={() => setIsDonationOpen(true)}
        />
        <ChatLog messages={messages} isUserConnected={isUserConnected} onReact={sendReaction} />
        <MessageInput
          onSendMessage={handleSendMessage}
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
    </div>
  );
};

const AdminConsole = () => {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [feedbackEntries, setFeedbackEntries] = useState([]);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [status, setStatus] = useState(null);
  const [adminStats, setAdminStats] = useState(null);
  const [isAdminStatsLoading, setIsAdminStatsLoading] = useState(false);

  const loadAdminStats = async (adminToken) => {
    setIsAdminStatsLoading(true);
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const result = await response.json();
      if (response.status === 401) setToken('');
      if (!response.ok) return;
      setAdminStats(result);
    } catch {
      // ignore
    } finally {
      setIsAdminStatsLoading(false);
    }
  };

  const loadFeedback = async (adminToken) => {
    setIsFeedbackLoading(true);
    setFeedbackError('');
    try {
      const response = await fetch('/api/admin/feedback', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const result = await response.json();
      if (response.status === 401) setToken('');
      if (!response.ok) throw new Error(result.error || 'Không thể tải góp ý.');
      setFeedbackEntries(result.feedback);
    } catch (error) {
      setFeedbackError(error.message || 'Không thể kết nối tới server.');
    } finally {
      setIsFeedbackLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không thể đăng nhập admin.');

      setToken(result.token);
      setPassword('');
      setStatus({ type: 'success', message: 'Đã đăng nhập. Phiên admin hết hạn sau 8 giờ.' });
      await Promise.all([loadFeedback(result.token), loadAdminStats(result.token)]);
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Không thể kết nối tới server.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendAnnouncement = async (event) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || !token) return;

    setIsSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: trimmedMessage })
      });
      const result = await response.json();
      if (response.status === 401) setToken('');
      if (!response.ok) throw new Error(result.error || 'Không thể gửi thông báo.');

      setMessage('');
      setStatus({
        type: 'success',
        message: `Đã gửi thông báo tới ${result.recipientCount} người đang online.`
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Không thể kết nối tới server.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/session', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok && response.status !== 401) {
        const result = await response.json();
        throw new Error(result.error || 'Không thể thu hồi phiên admin.');
      }
      setToken('');
      setStatus({ type: 'success', message: 'Đã đăng xuất admin.' });
    } catch (error) {
      setToken('');
      setStatus({
        type: 'error',
        message: `Đã xóa phiên trên trình duyệt nhưng chưa xác nhận thu hồi trên server: ${error.message || 'Lỗi kết nối.'}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-[#08090b] px-4 py-8 text-zinc-100">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#111214] p-5 sm:p-7">
        <a href="/" className="text-xs text-zinc-400 transition-colors hover:text-zinc-100">
          ← Quay lại chat
        </a>
        <h1 className="mt-6 text-xl font-semibold">Admin console</h1>
        <p className="mt-2 rounded-lg border border-amber-300/15 bg-amber-300/5 px-3 py-2.5 text-xs leading-relaxed text-amber-100/80">
          Admin có thể gửi thông báo hệ thống và xem góp ý người dùng chủ động gửi. Admin không thể xem tin nhắn hay nội dung trò chuyện riêng tư.
        </p>

        {!token ? (
          <form onSubmit={handleLogin} className="mt-6 space-y-3">
            <label htmlFor="admin-password" className="block text-xs text-zinc-400">
              Mật khẩu admin
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={isSubmitting}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-zinc-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!password || isSubmitting}
              className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? 'Đang xác thực…' : 'Đăng nhập'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSendAnnouncement} className="mt-6 space-y-3">
            <label htmlFor="admin-announcement" className="block text-xs text-zinc-400">
              Thông báo hệ thống
            </label>
            <textarea
              id="admin-announcement"
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, 1000))}
              maxLength={1000}
              rows={5}
              required
              disabled={isSubmitting}
              placeholder="Viết thông báo sẽ hiển thị cho mọi người đang online…"
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-zinc-500 disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] text-zinc-500">{message.length}/1000 ký tự</p>
              <button
                type="submit"
                disabled={!message.trim() || isSubmitting}
                className="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting ? 'Đang gửi…' : 'Gửi thông báo'}
              </button>
            </div>
          </form>
        )}

        {token && (
          <section className="mt-8 border-t border-zinc-800 pt-6" aria-labelledby="admin-stats-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="admin-stats-title" className="text-sm font-medium text-zinc-100">Thống kê hệ thống (Nội bộ)</h2>
                <p className="mt-1 text-[10px] text-zinc-500">Chỉ admin đăng nhập mới xem được thông số này</p>
              </div>
              <button
                type="button"
                onClick={() => loadAdminStats(token)}
                disabled={isAdminStatsLoading}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {isAdminStatsLoading ? 'Đang tải…' : 'Làm mới'}
              </button>
            </div>
            {adminStats && (
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Trực tuyến</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-400">{adminStats.onlineCount ?? 0}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Phiên chat</p>
                  <p className="mt-1 text-xl font-semibold text-sky-400">{adminStats.activePairs ?? 0}</p>
                  <p className="mt-0.5 text-[9px] text-zinc-500">{(adminStats.activePairs ?? 0) * 2} người đang chat</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Hàng đợi</p>
                  <p className="mt-1 text-xl font-semibold text-amber-400">{adminStats.waitingUsers ?? 0}</p>
                  <p className="mt-0.5 text-[9px] text-zinc-500">đang tìm người lạ</p>
                </div>
              </div>
            )}
          </section>
        )}

        {token && (
          <section className="mt-8 border-t border-zinc-800 pt-6" aria-labelledby="admin-feedback-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="admin-feedback-title" className="text-sm font-medium text-zinc-100">Góp ý người dùng</h2>
                <p className="mt-1 text-[10px] text-zinc-500">Tối đa 100 góp ý gần nhất</p>
              </div>
              <button
                type="button"
                onClick={() => loadFeedback(token)}
                disabled={isFeedbackLoading}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {isFeedbackLoading ? 'Đang tải…' : 'Làm mới'}
              </button>
            </div>
            {feedbackError && (
              <p className="mt-3 text-xs text-rose-300" role="alert">{feedbackError}</p>
            )}
            {!feedbackError && !isFeedbackLoading && feedbackEntries.length === 0 && (
              <p className="mt-4 text-xs text-zinc-500">Chưa có góp ý nào.</p>
            )}
            {feedbackEntries.length > 0 && (
              <ol className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
                {feedbackEntries.map((entry, index) => (
                  <li
                    key={`${entry.timestamp}-${index}`}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-zinc-200">
                        {entry.username || 'Ẩn danh'}
                      </p>
                      <time className="text-[10px] text-zinc-500" dateTime={entry.timestamp}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400">
                      {entry.feedback}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {status && (
          <p
            className={`mt-4 text-xs ${status.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}
            role={status.type === 'error' ? 'alert' : 'status'}
          >
            {status.message}
          </p>
        )}

        {token && (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isSubmitting}
            className="mt-5 text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-300 disabled:opacity-50"
          >
            Đăng xuất admin
          </button>
        )}
      </section>
    </main>
  );
};

const AnonyChat = () => (
  window.location.pathname.replace(/\/+$/, '') === '/admin'
    ? <AdminConsole />
    : <ChatApp />
);

export default AnonyChat;
