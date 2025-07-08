import { useEffect } from 'react';

const TOAST_DURATION = Number(import.meta.env.VITE_TOAST_DURATION) || 3000;

const Toast = ({ message, type = 'info', onClose, duration = TOAST_DURATION }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose && onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  let color = 'bg-gray-900 text-white border border-gray-700';
  if (type === 'error') color = 'bg-gray-900 text-red-500 border border-red-700';
  if (type === 'success') color = 'bg-gray-900 text-green-500 border border-green-700';
  if (type === 'warning') color = 'bg-gray-900 text-yellow-500 border border-yellow-700';

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 ${color} animate-fadeIn`}
      role="alert"
      style={{ minWidth: 200 }}
    >
      {message}
    </div>
  );
};

export default Toast;
