import { memo } from 'react';

const SystemNotification = memo(({ message }) => {
  return (
    <div className="text-neutral-400 italic text-xs md:text-sm my-1 text-center transform transition-all duration-100 ease-out">
      {message}
    </div>
  );
});

export default SystemNotification;
