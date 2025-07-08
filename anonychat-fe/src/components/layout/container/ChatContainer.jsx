import { memo } from 'react';

const ChatContainer = memo(({ children }) => (
  <div className="w-full max-w-3xl md:max-w-4xl lg:max-w-5xl flex flex-col mx-auto flex-1 h-full max-h-[100dvh] lg:max-h-screen space-y-4">
    {children}
  </div>
));

export default ChatContainer;
