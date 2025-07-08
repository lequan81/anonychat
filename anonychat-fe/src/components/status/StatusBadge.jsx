function StatusBadge({ status }) {
  return (
    <div
      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all duration-300 ${status.badge}`}
    >
      <span className="relative flex size-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full animate-ping opacity-75 ${status.ping}`}
        ></span>
        <span className={`relative inline-flex rounded-full size-2 ${status.dot}`}></span>
      </span>
      {status.label}
    </div>
  );
}

export default StatusBadge;
