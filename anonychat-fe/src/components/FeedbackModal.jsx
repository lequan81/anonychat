import React, { useState, useEffect, useRef } from 'react';

export const FeedbackModal = React.memo(({ status, onClose, onSubmit }) => {
  const [feedback, setFeedback] = useState('');
  const [username, setUsername] = useState('');
  const textareaRef = useRef(null);
  const isPending = status?.type === 'pending';
  const isSent = status?.type === 'success';

  useEffect(() => {
    textareaRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isPending) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onClose]);

  const submit = (event) => {
    event.preventDefault();
    if (!feedback.trim() || isPending || isSent) return;
    onSubmit({ feedback: feedback.trim(), username: username.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-[#111216] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="feedback-title" className="text-sm font-semibold text-zinc-100">
              Góp ý với admin
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Ý kiến của bạn giúp AnonyChat ngày một tốt hơn. Tin nhắn gửi hoàn toàn ẩn danh.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
            aria-label="Đóng cửa sổ góp ý"
          >
            ×
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value.slice(0, 2000))}
          maxLength={2000}
          rows={5}
          disabled={isPending || isSent}
          placeholder="Bạn muốn phản ánh hoặc góp ý tính năng gì?…"
          className="w-full resize-y rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-60"
        />

        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value.slice(0, 80))}
          maxLength={80}
          disabled={isPending || isSent}
          placeholder="Tên của bạn (không bắt buộc)"
          aria-label="Tên của bạn (không bắt buộc)"
          className="mt-3 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-60"
        />

        <div className="mt-4 flex items-center justify-between gap-3">
          <p
            className={`text-xs ${
              status?.type === 'error'
                ? 'text-rose-300'
                : status?.type === 'success'
                ? 'text-emerald-300'
                : 'text-zinc-400'
            }`}
            role={status?.type === 'error' ? 'alert' : 'status'}
          >
            {status?.message || `${feedback.length}/2000 ký tự`}
          </p>
          <button
            type="submit"
            disabled={!feedback.trim() || isPending || isSent}
            className="shrink-0 rounded-xl bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
          >
            {isPending ? 'Đang gửi…' : isSent ? 'Đã gửi thành công' : 'Gửi góp ý'}
          </button>
        </div>
      </form>
    </div>
  );
});

FeedbackModal.displayName = 'FeedbackModal';

export default FeedbackModal;
