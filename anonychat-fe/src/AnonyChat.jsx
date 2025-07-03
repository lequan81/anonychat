import React, { useState, useEffect, useRef } from 'react';

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
  const [messages, setMessages] = useState([]);
  const [typingStatus, setTypingStatus] = useState('');

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

      if (msg.system?.includes('Connected to a stranger')) {
        setIsConnected(true);
        // Clear previous chat when new user connects
        setMessages([]);
        playSound('connect');
      }

      if (msg.system?.includes('disconnected')) {
        setIsConnected(false);
        playSound('disconnect');
      }

      if (msg.type === 'text') {
        const soundType = msg.from === 'self' ? 'send' : 'receive';
        playSound(soundType);
        
        setMessages(prev => [...prev, {
          type: 'text',
          data: msg.data,
          from: msg.from,
          isMine: msg.from === 'self'
        }]);
      }

      if (msg.type === 'typing') {
        setTypingStatus('Stranger is typing…');
        setTimeout(() => setTypingStatus(''), 2000);
      }

      if (msg.system) {
        setMessages(prev => [...prev, { system: msg.system }]);
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
  });

  const sendMessage = (data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  return { isConnected, messages, typingStatus, sendMessage };
};

const ChatBubble = ({ message, isMine }) => (
  <div className={`max-w-[85%] md:max-w-[75%] w-fit px-3 py-2 my-1 rounded-lg text-sm md:text-base break-words ${
    isMine 
      ? 'ml-auto bg-blue-500 text-white text-right' 
      : 'mr-auto bg-gray-600 text-white text-left'
  }`}>
    {message}
  </div>
);

const SystemMessage = ({ message }) => (
  <div className="text-gray-400 italic text-xs md:text-sm my-1 text-center">
    {message}
  </div>
);

const TypingIndicator = ({ typingStatus }) => (
  <div className="text-gray-400 text-xs h-4 pl-1">
    {typingStatus}
  </div>
);

const ChatLog = ({ messages }) => {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div 
      ref={logRef}
      className="flex-1 overflow-y-auto bg-gray-700 rounded-lg p-2 md:p-3 text-sm space-y-1 min-h-64 md:min-h-96 md:h-80 lg:h-96"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255, 255, 255, 0.1) transparent'
      }}
    >
      {messages.map((msg, idx) => (
        <div key={idx}>
          {msg.system ? (
            <SystemMessage message={msg.system} />
          ) : (
            <ChatBubble message={msg.data} isMine={msg.isMine} />
          )}
        </div>
      ))}
    </div>
  );
};

const MessageInput = ({ onSendMessage, onTyping }) => {
  const [message, setMessage] = useState('');
  const typingTimeoutRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && message.trim()) {
      onSendMessage({ type: 'text', data: message });
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
    <input
      type="text"
      value={message}
      onChange={(e) => setMessage(e.target.value)}
      onKeyDown={handleKeyDown}
      className="w-full px-3 py-2 md:py-3 rounded bg-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm md:text-base"
      placeholder="Type a message..."
      autoComplete="off"
      autoFocus
    />
  );
};

const ChatHeader = () => (
  <h1 className="text-lg md:text-xl font-semibold text-center text-purple-300">
    AnonyChat
  </h1>
);

const ChatContainer = ({ children }) => (
  <div className="chat-container w-full max-w-md md:max-w-lg lg:max-w-xl p-4 md:p-6 space-y-3 bg-gray-800 md:rounded-lg md:shadow-lg flex flex-col h-full md:h-auto">
    {children}
  </div>
);

const AnonyChat = () => {
  const { playSound } = useAudio();
  const { isConnected, messages, typingStatus, sendMessage } = useWebSocket(playSound);
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
    if (isConnected) {
      sendMessage({ type: 'typing' });
    }
  };

  return (
    <div 
      className="bg-gray-900 text-white flex items-center justify-center p-0 md:p-4"
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
        <ChatHeader />
        <ChatLog messages={messages} />
        <TypingIndicator typingStatus={typingStatus} />
        <MessageInput 
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
        />
      </ChatContainer>
    </div>
  );
};

export default AnonyChat;