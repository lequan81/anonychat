import { useState, useEffect, useRef, useCallback } from 'react';

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
  const [messages, setMessages] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const typingTimeoutRef = useRef(null);

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
    let reconnectDelay = 500;
    let disposed = false;
    let hasLostConnection = false;

    const connect = () => {
      if (disposed) return;

      websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        reconnectDelay = 500;
        setWs(websocket);
        hasLostConnection = false;
      };

      websocket.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          msg = { system: event.data };
        }

        if (msg.type === 'stats' && msg.onlineCount !== undefined) {
          setOnlineCount(msg.onlineCount);
        }

        if (msg.type === 'receipt') {
          setMessages((prev) => prev.map((m) => (m.id === msg.messageId ? { ...m, delivered: true } : m)));
          return;
        }

        if (msg.system?.includes('Connected to a stranger')) {
          setIsUserConnected(true);
          setMessages([]);
          playSound('connect');
        }

        if (msg.system?.toLowerCase().includes('reconnected')) {
          setIsUserConnected(true);
        }

        if (msg.system?.includes('Waiting for a stranger') || msg.system?.includes('No partner available')) {
          setIsUserConnected(false);
        }

        if (msg.system?.toLowerCase().includes('connection lost')) {
          setIsUserConnected(false);
        }

        if (msg.system?.includes('disconnected')) {
          setIsUserConnected(false);
          playSound('disconnect');
        }

        if (msg.type === 'text') {
          const soundType = msg.from === 'self' ? 'send' : 'receive';
          playSound(soundType);

          const incomingMessage = {
            id: msg.id,
            type: 'text',
            data: msg.data,
            from: msg.from,
            isMine: msg.from === 'self',
            delivered: msg.from === 'self' ? false : true,
            timestamp: Date.now()
          };

          if (msg.from === 'stranger' && msg.id && websocket.readyState === WebSocket.OPEN) {
            websocket.send(
              JSON.stringify({
                type: 'receipt',
                messageId: msg.id
              })
            );
          }

          if (msg.from === 'stranger') {
            window.clearTimeout(typingTimeoutRef.current);
          }

          setMessages((prev) => {
            if (msg.from === 'stranger') {
              const typingIndex = prev.findLastIndex((item) => item.type === 'typing');
              if (typingIndex >= 0) {
                return prev.map((item, index) => index === typingIndex ? incomingMessage : item);
              }
            }
            return [...prev, incomingMessage];
          });
        }

        if (msg.type === 'typing') {
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
          setMessages((prev) => [
            ...prev,
            {
              system: msg.system,
              timestamp: Date.now()
            }
          ]);
        }
      };

      websocket.onclose = () => {
        if (disposed) return;

        setWs(null);
        setIsUserConnected(false);
        if (!hasLostConnection) {
          hasLostConnection = true;
          setMessages((prev) => [
            ...prev,
            { system: '[SYSTEM] Connection lost. Retrying…', timestamp: Date.now() }
          ]);
        }
        reconnectTimeout = window.setTimeout(() => {
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
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
      window.clearTimeout(typingTimeoutRef.current);
      if (websocket && websocket.readyState !== WebSocket.CLOSING && websocket.readyState !== WebSocket.CLOSED) {
        websocket.close();
      }
    };
  }, [playSound]);

  const sendMessage = (data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  return { isUserConnected, messages, sendMessage, onlineCount };
};

const ChatBubble = ({ message, isMine, delivered }) => (
  <div
    className={`max-w-[82%] w-fit break-words rounded-[1.35rem] border px-3 py-2.5 text-sm leading-relaxed transition-colors duration-200 ${isMine
      ? delivered
        ? 'ml-auto border-emerald-500/20 bg-emerald-500/[0.035] text-zinc-100 text-right'
        : 'ml-auto border-amber-500/25 bg-amber-500/[0.06] text-zinc-100 text-right'
      : 'mr-auto border-zinc-800 bg-zinc-900/50 text-zinc-100 text-left'
      }`}
  >
    <span className="block">{message}</span>
  </div>
);

const SystemMessage = ({ message }) => {
  const normalizedMessage = message.toLowerCase();
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
    : normalizedMessage.includes('connection lost. retrying')
      ? 'Mất kết nối · Đang thử lại'
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
                  : message.replace(/^\[SYSTEM\]\s*/i, '');

  return (
    <div className="my-2 flex items-center gap-2.5 py-1" role="status">
      <span className="h-px flex-1 bg-zinc-800/80" />
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotStyle}`} />
      <span className={`text-center text-[9px] font-medium tracking-wide ${textStyle}`}>{label}</span>
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
      className={`inline-flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-300 transition-all duration-300 ${isAnimating ? 'scale-[1.02]' : 'scale-100'
        }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {count ?? 0} trực tuyến
    </div>
  );
};

const ChatLog = ({ messages, isUserConnected }) => {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTo({
        top: logRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

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
            <div key={msg.id || `${msg.timestamp}-${idx}`}>
              {msg.system ? (
                <SystemMessage message={msg.system} />
              ) : msg.type === 'typing' ? (
                <TypingBubble />
              ) : (
                <ChatBubble message={msg.data} isMine={msg.isMine} delivered={msg.delivered} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MessageInput = ({ onSendMessage, onTyping, isConnected }) => {
  const [message, setMessage] = useState('');
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

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
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    onSendMessage({
      type: 'text',
      data: message,
      id: messageId
    });
    setMessage('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  const handleFocus = () => {
    requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-[1.5rem] border border-zinc-800/80 bg-[#0a0a0b] p-2 transition-all duration-200 focus-within:ring-1 focus-within:ring-zinc-700/80 md:p-3">
      <textarea
        ref={inputRef}
        rows={1}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          handleTyping();
        }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        className="max-h-[120px] min-h-[40px] flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-2 text-sm leading-6 text-zinc-50 placeholder:text-zinc-500 focus:outline-none disabled:cursor-not-allowed"
        placeholder={isConnected ? 'Nhập tin nhắn...' : 'Đang kết nối...'}
        autoComplete="off"
        autoFocus
        disabled={!isConnected}
      />
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
  );
};

const ChatHeader = ({ onlineCount, isUserConnected }) => (
  <div className="flex shrink-0 items-center justify-between gap-2 rounded-[1.05rem] bg-[#111214]/80 px-3 py-2.5 md:px-4 md:py-3">
    <div className="min-w-0">
      <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-zinc-500 md:text-[9px]">anonychat</p>
    </div>
    <div className="flex items-center gap-2 text-right">
      <OnlineCounter count={onlineCount} />
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[8px] font-medium uppercase tracking-[0.12em] md:text-[9px] ${isUserConnected ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-900 text-zinc-400'
          }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isUserConnected ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
        {isUserConnected ? 'Kết nối' : 'Đang tìm'}
      </div>
    </div>
  </div>
);

const ChatContainer = ({ children }) => (
  <div className="relative h-full min-h-0 w-full max-w-[28rem] rounded-[1.3rem] bg-[#0b0b0d] p-1.5 md:max-w-xl md:rounded-[1.6rem] md:p-2">
    <div className="relative flex h-full min-h-0 flex-col gap-2 md:gap-3">{children}</div>
  </div>
);

const AnonyChat = () => {
  const { playSound } = useAudio();
  const { isUserConnected, messages, sendMessage, onlineCount } = useWebSocket(playSound);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

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

  return (
    <div
      className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-[#08090b] px-3 py-3 text-zinc-100 md:px-8 md:py-8"
      style={{
        fontFamily: 'Maple Mono, monospace',
        height: `${viewportHeight}px`,
        paddingBottom: keyboardOffset > 0 ? 'max(0.75rem, env(safe-area-inset-bottom))' : undefined,
        paddingTop: keyboardOffset > 0 ? 'max(0.75rem, env(safe-area-inset-top))' : undefined,
        justifyContent: keyboardOffset > 0 ? 'flex-start' : 'center'
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:18px_18px]" />

      <ChatContainer>
        <ChatHeader onlineCount={onlineCount} isUserConnected={isUserConnected} />
        <ChatLog messages={messages} isUserConnected={isUserConnected} />
        <MessageInput onSendMessage={handleSendMessage} onTyping={handleTyping} isConnected={isUserConnected} />
      </ChatContainer>
    </div>
  );
};

export default AnonyChat;
