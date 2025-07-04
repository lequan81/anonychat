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
        audio.play().catch(e => console.log('Audio play failed:', e));
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

      // Handle online count updates
      if (msg.type === 'stats' && msg.onlineCount !== undefined) {
        setOnlineCount(msg.onlineCount);
      }

      // Handle delivery receipts
      if (msg.type === 'receipt') {
        setMessages(prev => prev.map(m => 
          m.id === msg.messageId ? { ...m, delivered: true } : m
        ));
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
        
        // Send receipt for received messages
        if (msg.from === 'stranger' && msg.id && websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({
            type: 'receipt',
            messageId: msg.id
          }));
        }
        
        setMessages(prev => [...prev, {
          id: msg.id,
          type: 'text',
          data: msg.data,
          from: msg.from,
          isMine: msg.from === 'self',
          delivered: msg.from === 'self' ? false : true,
          timestamp: Date.now()
        }]);
      }

      if (msg.type === 'typing') {
        setTypingStatus('Stranger is typing…');
        setTimeout(() => setTypingStatus(''), 2000);
      }

      if (msg.system) {
        setMessages(prev => [...prev, {
          system: msg.system,
          timestamp: Date.now()
        }]);
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

const ChatBubble = ({ message, isMine, delivered }) => {
  return (
    <div 
      className={`outline-none border-none max-w-[85%] md:max-w-[75%] w-fit px-3 py-2 my-1 rounded-lg text-sm md:text-base break-words relative transform transition-all duration-100 ease-out 
        ${
        isMine 
          ? `ml-auto text-white text-right ${
            delivered ? 'bg-blue-500 shadow-lg' : 'border-white border-2 border-dashed'
          }`
          : 'mr-auto bg-gray-500 text-white text-left shadow-lg'
      }`}
    >
      {message}
    </div>
  );
};

const SystemMessage = ({ message }) => {
  return (
    <div className={"text-gray-400 italic text-xs md:text-sm my-1 text-center transform transition-all duration-100 ease-out"}>
      {message}
    </div>
  );
};

const TypingIndicator = ({ typingStatus }) => (
  <div className={`text-gray-400 text-xs h-4 pl-1 transition-all duration-300 ${
    typingStatus ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
  }`}>
    {typingStatus && (
      <span className="flex items-center">
        <span className="animate-pulse mr-1">💬</span>
        {typingStatus}
        <span className="ml-1 animate-bounce">...</span>
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
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setPrevCount(count);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [count, prevCount]);

  return (
    <div className={`text-green-400 text-xs text-center transition-all duration-300 my-auto ${
      isAnimating ? 'scale-110 text-green-300' : 'scale-100'
    }`}>
      <span className="animate-pulse">🟢</span> {count+121} online
    </div>
  );
};

const ChatLog = ({ messages }) => {
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
      className="flex-1 overflow-y-auto bg-gray-700 rounded-lg p-2 md:p-3 text-sm space-y-1 min-h-64 md:max-h-100 md:min-h-96 md:h-80 lg:h-96 shadow-inner"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255, 255, 255, 0.1) transparent'
      }}
    >
      {messages.map((msg, idx) => (
        <div key={msg.id || `${msg.timestamp}-${idx}`}>
          {msg.system ? (
            <SystemMessage message={msg.system} />
          ) : (
            <ChatBubble 
              message={msg.data} 
              isMine={msg.isMine} 
              delivered={msg.delivered}
            />
          )}
        </div>
      ))}
    </div>
  );
};

const MessageInput = ({ onSendMessage, onTyping, isConnected }) => {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const typingTimeoutRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && message.trim()) {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      onSendMessage({ 
        type: 'text', 
        data: message,
        id: messageId
      });
      setMessage('');
    } else {
      handleTyping();
    }
  };

  const handleTyping = () => {
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping();
    }, 300);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`w-full px-3 py-2 md:py-3 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm md:text-base transition-all duration-300 shadow-lg ${
          isFocused ? 'shadow-xl ring-2 ring-purple-400' : 'shadow-lg'
        } ${
          !isConnected ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        placeholder={isConnected ? "Type a message..." : "Connecting..."}
        autoComplete="off"
        autoFocus
        disabled={!isConnected}
      />
    </div>
  );
};

const ChatHeader = ({ onlineCount, isUserConnected }) => {
  return (
    <div className="text-center">
      <h1 className={`text-lg md:text-xl font-bold text-purple-400 bg-clip-text mb-2 ${
        isUserConnected ? '' : 'animate-pulse'
      }`}>
        AnonyChat
      </h1>
      <div className={`flex items-center justify-center space-x-4 transition-all duration-300 ${
        isUserConnected ? 'opacity-100' : 'opacity-50'
      }`}>
        <OnlineCounter count={onlineCount} />
        <div className={`text-xs px-2 py-1 rounded-full transition-all duration-300 ${
          isUserConnected 
            ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
            : 'bg-red-500/20 text-red-400 border border-red-500/50'
        }`}>
          {isUserConnected ? '🟢 Connected' : '🔴 Connecting...'}
        </div>
      </div>
    </div>
  );
};

const ChatContainer = ({ children }) => (
  <div className="chat-container w-full max-w-md md:max-w-lg lg:max-w-xl p-4 md:p-6 space-y-3 bg-gray-800 md:rounded-2xl md:shadow-2xl flex flex-col h-full md:h-auto border border-gray-700/50">
    {children}
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
      className="bg-gray-900 text-white flex items-center justify-center p-0 md:p-4 relative overflow-hidden"
      style={{ 
        fontFamily: 'Maple Mono, monospace',
        height: `${viewportHeight}px`,
        minHeight: `${viewportHeight}px`
      }}
    >
      <style jsx>{`
        @font-face {
          font-family: 'Maple Mono';
          src: url('/fonts/MapleMono.ttf') format('truetype');
          font-display: swap;
        }
      `}</style>

      <ChatContainer>
        <ChatHeader onlineCount={onlineCount} isUserConnected={isUserConnected} />
        <ChatLog messages={messages} />
        <TypingIndicator typingStatus={typingStatus} />
        <MessageInput
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          isConnected={isUserConnected}
        />
      </ChatContainer>
    </div>
  );
};

export default AnonyChat;
