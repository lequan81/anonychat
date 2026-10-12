import { useState, useEffect, useRef } from 'react';

const useAudio = () => {
  const audioRefs = useRef({
    connect: new Audio('/sounds/activity.mp3'),
    disconnect: new Audio('/sounds/activity.mp3'),
    send: new Audio('/sounds/message.mp3'),
    receive: new Audio('/sounds/message.mp3')
  });

  const playSound = (type) => {
    try {
      const audio = audioRefs.current[type];
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch((e) => console.log('Audio play failed:', e));
      }
    } catch (error) {
      console.log('Audio error:', error);
    }
  };

  return { playSound };
};

const useWebSocket = (playSound) => {
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isUserConnected, setIsUserConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [typingStatus, setTypingStatus] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      setWs(websocket);
      setIsConnected(true);
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
        setIsConnected(true);
        setIsUserConnected(true);
        setMessages([]);
        playSound('connect');
      }

      if (msg.system?.includes('disconnected')) {
        setIsConnected(false);
        setIsUserConnected(false);
        playSound('disconnect');
      }

      if (msg.type === 'text') {
        const soundType = msg.from === 'self' ? 'send' : 'receive';
        playSound(soundType);

        if (msg.from === 'stranger' && msg.id && websocket.readyState === WebSocket.OPEN) {
          websocket.send(
            JSON.stringify({
              type: 'receipt',
              messageId: msg.id
            })
          );
        }

        setMessages((prev) => [
          ...prev,
          {
            id: msg.id,
            type: 'text',
            data: msg.data,
            from: msg.from,
            isMine: msg.from === 'self',
            delivered: msg.from === 'self' ? false : true,
            timestamp: Date.now()
          }
        ]);
      }

      if (msg.type === 'typing') {
        setTypingStatus('Người lạ đang nhập…');
        window.setTimeout(() => setTypingStatus(''), 2000);
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
      setIsConnected(false);
      setWs(null);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, []);

  const sendMessage = (data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  return { isConnected, isUserConnected, messages, typingStatus, sendMessage, onlineCount };
};

const ChatBubble = ({ message, isMine, delivered }) => (
  <div
    className={`max-w-[82%] w-fit break-words rounded-[1.35rem] px-3 py-2.5 text-sm leading-relaxed transition-all duration-300 ${
      isMine
        ? 'ml-auto bg-zinc-100 text-zinc-900 text-right'
        : 'mr-auto bg-zinc-900/80 text-zinc-100 text-left'
    }`}
  >
    <span className="block">{message}</span>
    {isMine && (
      <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        {delivered ? 'sent' : 'sending'}
      </span>
    )}
  </div>
);

const SystemMessage = ({ message }) => (
  <div className="my-2 text-center text-[9px] font-medium uppercase tracking-[0.2em] text-zinc-500">
    {message}
  </div>
);

const TypingIndicator = ({ typingStatus }) => (
  <div
    className={`h-5 text-xs text-zinc-400 transition-all duration-300 ${
      typingStatus ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
    }`}
  >
    {typingStatus && (
      <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-2.5 py-1">
        <span className="inline-flex gap-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-300" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-300 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-300 [animation-delay:300ms]" />
        </span>
        {typingStatus}
      </span>
    )}
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
      className={`inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-300 transition-all duration-300 ${
        isAnimating ? 'scale-[1.03]' : 'scale-100'
      }`}
    >
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
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
      className="relative flex-1 overflow-y-auto rounded-[1.5rem] border border-zinc-800/80 bg-[#0a0a0b] p-3 md:p-4"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.14) transparent'
      }}
    >
      {messages.length === 0 ? (
        <div className="flex h-full min-h-[220px] items-center justify-center p-4 text-center">
          <div className="max-w-xs">
                <p className="text-[9px] font-medium uppercase tracking-[0.22em] text-zinc-500">trạng thái phòng</p>
            <h2 className="mt-3 text-lg font-medium text-zinc-100">
                  {isUserConnected ? 'Bạn đang ở trong phòng.' : 'Đang chờ người lạ...'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {isUserConnected
                    ? 'Hãy chào hỏi và giữ cuộc trò chuyện đang chạy.'
                    : 'Mốc tiếp theo sẽ xuất hiện khi có ai đó tham gia.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg, idx) => (
            <div key={msg.id || `${msg.timestamp}-${idx}`}>
              {msg.system ? (
                <SystemMessage message={msg.system} />
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
  const [isFocused, setIsFocused] = useState(false);
  const typingTimeoutRef = useRef(null);

  const handleTyping = () => {
    if (!isConnected) return;
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping();
    }, 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && message.trim()) {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      onSendMessage({
        type: 'text',
        data: message,
        id: messageId
      });
      setMessage('');
      return;
    }

    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
      handleTyping();
    }
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

  return (
    <div className="rounded-[1.5rem] border border-zinc-800/80 bg-zinc-950/70 px-2 py-2">
      <div className="flex items-center gap-2 rounded-[1.2rem] bg-zinc-950/80 px-2 py-2 transition-all duration-200 focus-within:border focus-within:border-zinc-700">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="flex-1 bg-transparent px-2 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none disabled:cursor-not-allowed"
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
      {isFocused && <div className="mt-2 text-[9px] uppercase tracking-[0.2em] text-zinc-500">truyền ẩn danh</div>}
    </div>
  );
};

const ChatHeader = ({ onlineCount, isUserConnected }) => (
  <div className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-zinc-800/80 bg-zinc-900/80 px-4 py-3 md:px-5">
    <div>
      <p className="text-[9px] font-medium uppercase tracking-[0.24em] text-zinc-500">anonychat</p>
      <h1 className="mt-1 text-xl font-medium tracking-[-0.06em] text-zinc-100 md:text-2xl">Phòng người lạ</h1>
    </div>
    <div className="flex items-center gap-2">
      <OnlineCounter count={onlineCount} />
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.18em] ${
          isUserConnected
            ? 'border-zinc-700 bg-zinc-800 text-zinc-200'
            : 'border-zinc-700 bg-zinc-900 text-zinc-400'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${isUserConnected ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
        {isUserConnected ? 'Đã kết nối' : 'Đang tìm'}
      </div>
    </div>
  </div>
);

const ChatContainer = ({ children }) => (
  <div className="relative w-full max-w-xl rounded-[1.8rem] border border-zinc-800/80 bg-[#0d0d0f] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.18)] md:p-4">
    <div className="relative flex h-full min-h-[520px] flex-col gap-3 md:gap-4">{children}</div>
  </div>
);

const AnonyChat = () => {
  const { playSound } = useAudio();
  const { isUserConnected, messages, typingStatus, sendMessage, onlineCount } = useWebSocket(playSound);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    const updateHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(height);
    };

    const resizeHandler = () => {
      updateHeight();
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resizeHandler);
    } else {
      window.addEventListener('resize', resizeHandler);
    }

    updateHeight();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', resizeHandler);
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
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#08090b] px-4 py-8 text-zinc-100 md:px-8"
      style={{
        fontFamily: 'Maple Mono, monospace',
        minHeight: `${viewportHeight}px`
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:18px_18px]" />

      <ChatContainer>
        <ChatHeader onlineCount={onlineCount} isUserConnected={isUserConnected} />
        <ChatLog messages={messages} isUserConnected={isUserConnected} />
        <TypingIndicator typingStatus={typingStatus} />
        <MessageInput onSendMessage={handleSendMessage} onTyping={handleTyping} isConnected={isUserConnected} />
      </ChatContainer>
    </div>
  );
};

export default AnonyChat;
