import React, { useRef, useLayoutEffect } from 'react';
import ChatMessage from './ChatMessage.jsx';
import SystemMessage from './SystemMessage.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import WaitingRadar from './WaitingRadar.jsx';

export const ChatLog = React.memo(({ messages, isUserConnected, onReact }) => {
  const logRef = useRef(null);

  useLayoutEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, isUserConnected]);

  return (
    <div
      ref={logRef}
      className="relative min-h-0 flex-1 overflow-y-auto rounded-[1.5rem] border border-zinc-800/80 bg-[#0c0d10] p-3 md:p-4 shadow-inner"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.12) transparent'
      }}
      role="log"
      aria-live="polite"
      aria-label="Khung chat trực tuyến"
    >
      {messages.length === 0 ? (
        <WaitingRadar isUserConnected={isUserConnected} />
      ) : (
        <div className="space-y-2.5">
          {messages.map((msg, idx) => (
            <div key={msg.index ?? msg.id ?? `${msg.timestamp}-${idx}`}>
              {msg.announcement ? (
                <>
                  <SystemMessage
                    message={{ system: `[ADMIN] ${msg.announcement}`, timestamp: msg.timestamp }}
                  />
                  <SystemMessage
                    message={{
                      system: 'Admin chỉ gửi thông báo này và không thể biết bạn đang nhắn gì.',
                      timestamp: msg.timestamp
                    }}
                  />
                </>
              ) : msg.system ? (
                <SystemMessage message={msg} />
              ) : msg.type === 'typing' ? (
                <TypingIndicator />
              ) : (
                <ChatMessage
                  message={msg.data}
                  image={msg.type === 'image' ? msg.data : null}
                  imageProgress={msg.imageProgress}
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
});

ChatLog.displayName = 'ChatLog';

export default ChatLog;
