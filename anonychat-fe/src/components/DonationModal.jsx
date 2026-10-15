import React, { useEffect, useRef } from 'react';

export const DonationModal = React.memo(({ onClose }) => {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedElement instanceof HTMLElement) {
        previouslyFocusedElement.focus();
      }
    };
  }, [onClose]);

  return (
    <div
      className="donation-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="donation-title"
        aria-describedby="donation-description"
        className="donation-modal-card relative w-full max-w-sm rounded-[1.75rem] border border-zinc-700/70 bg-[#111216] p-5 text-center shadow-2xl sm:p-6"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-3.5 top-3.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
          aria-label="Đóng cửa sổ ủng hộ"
        >
          ×
        </button>

        <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M12 21s-8.25-4.73-8.25-11.06A4.69 4.69 0 0 1 12 7.26a4.69 4.69 0 0 1 8.25 2.68C20.25 16.27 12 21 12 21Z" />
          </svg>
        </div>

        <h2 id="donation-title" className="text-base font-semibold text-zinc-100">
          Ủng hộ AnonyChat
        </h2>
        <p id="donation-description" className="mx-auto mt-1.5 max-w-[17rem] text-xs leading-relaxed text-zinc-400">
          Quét mã QR bằng ứng dụng ngân hàng để tiếp sức duy trì server anonychat.
        </p>

        <div className="mx-auto mt-5 w-full max-w-[18rem] overflow-hidden rounded-2xl bg-white p-2.5 shadow-md">
          <img
            src="/donate-qr-crop.jpg"
            alt="Mã QR VietQR để chuyển khoản qua ngân hàng MB"
            className="block aspect-square w-full rounded-xl object-cover"
          />
        </div>

        <p className="mt-3.5 text-xs tracking-wide text-zinc-400">
          Cảm ơn bạn đã đồng hành 💗
        </p>
      </section>
    </div>
  );
});

DonationModal.displayName = 'DonationModal';

export default DonationModal;
