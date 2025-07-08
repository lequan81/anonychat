import { memo } from 'react';
import { Link } from 'react-router-dom';
import { OnlineCounter, StatusBadge } from '@components/status';

const STATUS = {
  connected: {
    label: 'Connected',
    color: 'green',
    badge: 'text-green-500 border-green-700 bg-white/10',
    ping: 'bg-green-400',
    dot: 'bg-green-500',
  },
  waiting: {
    label: 'Waiting for stranger…',
    color: 'blue',
    badge: 'text-blue-400 border-blue-700 bg-white/10',
    ping: 'bg-blue-300',
    dot: 'bg-blue-400',
  },
  reconnecting: {
    label: 'Reconnecting…',
    color: 'amber',
    badge: 'text-amber-500 border-amber-700 bg-white/10',
    ping: 'bg-amber-400',
    dot: 'bg-amber-500',
  },
  connecting: {
    label: 'Connecting...',
    color: 'amber',
    badge: 'text-amber-500 border-amber-700 bg-white/10',
    ping: 'bg-amber-400',
    dot: 'bg-amber-500',
  },
  error: {
    label: 'Server error',
    color: 'red',
    badge: 'text-red-500 border-red-700 bg-white/10',
    ping: 'bg-red-400',
    dot: 'bg-red-500',
  },
};

const ChatHeader = memo(({ isStrangerConnected, isConnected, serverError, isReconnecting }) => {
  let status;
  if (serverError) status = STATUS.error;
  else if (isStrangerConnected) status = STATUS.connected;
  else if (isReconnecting) status = STATUS.reconnecting;
  else if (isConnected) status = STATUS.waiting;
  else status = STATUS.connecting;

  return (
    <div className="text-center pb-4 border-b border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4 text-xs">
          <Link
            to="/about"
            className="text-gray-400 hover:text-purple-400 transition-colors"
          >
            About
          </Link>
          <Link
            to="/policy"
            className="text-gray-400 hover:text-purple-400 transition-colors"
          >
            Privacy
          </Link>
        </div>
        <Link
          to="/"
          className="text-xl md:text-2xl font-bold text-purple-400 hover:text-purple-300 transition-colors"
        >
          {import.meta.env.VITE_APP_NAME || 'AnonyChat'}
        </Link>
        <div className="flex items-center text-xs text-gray-500">
          <span>
            &copy; {import.meta.env.VITE_COPYRIGHT_YEAR || 2025} {import.meta.env.VITE_APP_NAME || 'AnonyChat'}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-center space-x-4 transition-all duration-300">
        <OnlineCounter />
        <StatusBadge status={status} />
      </div>
    </div>
  );
});

export default ChatHeader;
