import React, { useState, useEffect, useRef } from 'react';
import { compressImage } from '../utils/imageCompressor.js';

export const MessageInput = React.memo(({
  onSendMessage,
  onSendImage,
  onTyping,
  onOpenAdmin,
  isConnected
}) => {
  const [message, setMessage] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [message]);

  const handleTyping = () => {
    if (!isConnected) return;
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping();
    }, 300);
  };

  const submitMessage = () => {
    if (!message.trim() || !isConnected) return;
    if (message.trim().toLowerCase() === '/admin') {
      setMessage('');
      onOpenAdmin();
      return;
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    onSendMessage({
      type: 'text',
      data: message,
      id: messageId
    });
    setMessage('');
  };

  const processImage = async (file) => {
    setAttachmentError('');
    if (!file || !isConnected || isProcessingImage) return;

    setIsProcessingImage(true);
    try {
      const blob = await compressImage(file);
      onSendImage(blob);
    } catch (error) {
      console.error('Image processing failed:', error);
      setAttachmentError(error.message || 'Không thể xử lý ảnh này.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleImageSelected = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    processImage(file);
  };

  const handlePaste = (event) => {
    const clipboardItems = Array.from(event.clipboardData.items);
    const imageItem = clipboardItems.find((item) => item.type.startsWith('image/'));
    const imageFile =
      imageItem?.getAsFile() ||
      Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'));

    if (!imageFile) return;

    event.preventDefault();
    processImage(imageFile);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  return (
    <div className="shrink-0 space-y-2 select-none">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleImageSelected}
        tabIndex={-1}
        aria-label="Chọn hình ảnh"
      />
      <div className="flex items-center gap-2 rounded-[1.5rem] border border-zinc-800/80 bg-[#0c0d10] p-2 transition-all duration-200 focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700/80 md:p-2.5">
        <textarea
          ref={inputRef}
          rows={1}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="max-h-[120px] min-h-[40px] flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-sm leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:cursor-not-allowed select-text"
          placeholder={isConnected ? 'Nhập tin nhắn hoặc dán ảnh (Ctrl+V)…' : 'Đang tìm người lạ…'}
          autoComplete="off"
          autoFocus
          disabled={!isConnected}
        />

        {isConnected && (
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isProcessingImage}
            className="inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-full p-2.5 text-zinc-400 transition-all duration-200 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
            aria-label="Gửi hình ảnh"
            title="Chọn ảnh hoặc dán ảnh bằng Ctrl+V"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M21 11.5 12.5 20a5 5 0 0 1-7.1-7.1l9.2-9.2a3.3 3.3 0 0 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={submitMessage}
          disabled={!isConnected || !message.trim()}
          className="inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-full bg-zinc-100 p-2.5 text-zinc-900 transition-all duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 active:scale-[0.97]"
          aria-label="Gửi tin nhắn"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
      </div>

      {(attachmentError || isProcessingImage) && (
        <p className="px-3 text-xs text-amber-300/90" role={attachmentError ? 'alert' : 'status'}>
          {attachmentError || 'Đang nén và chuẩn bị hình ảnh…'}
        </p>
      )}
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;
