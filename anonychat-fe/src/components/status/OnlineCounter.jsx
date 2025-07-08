import { memo } from 'react';
import { useOnlineCount } from '@hooks';

const OnlineCounter = memo(() => {
  const { onlineCount } = useOnlineCount();
  return (
    <div
      className={`flex items-center gap-x-1.5 text-xs text-center transition-all duration-300 my-auto ${
        onlineCount > 0 ? 'text-green-500' : 'text-gray-400'
      }`}
    >
      <span className="relative flex size-2">
        <span
          className={`animate-ping absolute inline-flex size-full rounded-full ${
            onlineCount > 0 ? 'bg-green-400' : 'bg-gray-300'
          } opacity-75`}
        ></span>
        <span
          className={`relative inline-flex rounded-full size-2 ${onlineCount > 0 ? 'bg-green-500' : 'bg-gray-400'}`}
        ></span>
      </span>
      <span>{onlineCount} online</span>
    </div>
  );
});

export default OnlineCounter;
