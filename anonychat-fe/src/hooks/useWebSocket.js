import { useState, useEffect, useRef, useCallback } from 'react';

export const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍'];
export const ACTIVITY_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
export const EVENT_ICONS = {
  text: '💬',
  image: '🖼️',
  reaction: '💟'
};

export const useWebSocket = (playSound, enabled = true) => {
  const [ws, setWs] = useState(null);
  const [isUserConnected, setIsUserConnected] = useState(false);
  const [hasActiveConversation, setHasActiveConversation] = useState(false);
  const [messages, setMessages] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [activityEventCount, setActivityEventCount] = useState(0);
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const activityEventCountRef = useRef(0);
  const eventMilestoneTypesRef = useRef(new Map());
  const typingTimeoutRef = useRef(null);
  const reconnectGraceRef = useRef(30);
  const nextMessageIndexRef = useRef(0);
  const imageTransfersRef = useRef(new Map());
  const blobUrlsRef = useRef([]);

  const revokeAllBlobUrls = useCallback(() => {
    if (blobUrlsRef.current.length > 0) {
      blobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore invalid or already revoked blob URLs
        }
      });
      blobUrlsRef.current = [];
    }
  }, []);

  const recordActivityEvent = useCallback((type) => {
    const count = ++activityEventCountRef.current;
    if (ACTIVITY_MILESTONES.includes(count) || (count > 1000 && count % 1000 === 0)) {
      eventMilestoneTypesRef.current.set(count, type);
    }
    setActivityEventCount(count);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setWs(null);
      setIsUserConnected(false);
      setHasActiveConversation(false);
      return undefined;
    }

    const storageKey = 'anonychat-client-id';
    let clientId = window.localStorage.getItem(storageKey);
    if (!clientId) {
      clientId = window.crypto.randomUUID();
      window.localStorage.setItem(storageKey, clientId);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?clientId=${encodeURIComponent(clientId)}`;
    let websocket;
    let reconnectTimeout;
    let keepaliveInterval;
    let reconnectDelay = 500;
    let disposed = false;
    let hasLostConnection = false;
    let isReconnecting = false;

    const CLIENT_KEEPALIVE_MS = 20_000;

    const connect = () => {
      if (disposed) return;

      websocket = new WebSocket(wsUrl);
      websocket.binaryType = 'arraybuffer';

      websocket.onopen = () => {
        reconnectDelay = 500;
        setWs(websocket);
        hasLostConnection = false;
        setMessages((prev) => prev.map((message) => (
          message.reconnectSeconds && !message.reconnectEndedAt
            ? { ...message, reconnectEndedAt: Date.now() }
            : message
        )));

        window.clearInterval(keepaliveInterval);
        keepaliveInterval = window.setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'ping' }));
          }
        }, CLIENT_KEEPALIVE_MS);
      };

      websocket.onmessage = (event) => {
        // Handle binary frames (chunked image relay)
        if (event.data instanceof ArrayBuffer) {
          const buffer = event.data;
          const HEADER = 40;
          if (buffer.byteLength < HEADER) return;

          const bytes = new Uint8Array(buffer, 0, 36);
          let transferId = '';
          for (let i = 0; i < 36; i++) transferId += String.fromCharCode(bytes[i]);

          const view = new DataView(buffer);
          const chunkIndex = view.getUint32(36, false);

          const transfer = imageTransfersRef.current.get(transferId);
          if (!transfer || chunkIndex >= transfer.totalChunks || transfer.chunks[chunkIndex]) return;

          transfer.chunks[chunkIndex] = new Uint8Array(buffer, HEADER);
          transfer.received++;

          const progress = Math.round((transfer.received / transfer.totalChunks) * 100);
          setMessages((prev) => prev.map((m) =>
            m.imageTransferId === transferId ? { ...m, imageProgress: progress } : m
          ));

          if (transfer.received >= transfer.totalChunks) {
            let totalSize = 0;
            for (const chunk of transfer.chunks) totalSize += chunk.length;
            const assembled = new Uint8Array(totalSize);
            let offset = 0;
            for (const chunk of transfer.chunks) {
              assembled.set(chunk, offset);
              offset += chunk.length;
            }

            imageTransfersRef.current.delete(transferId);

            const blob = new Blob([assembled], { type: 'image/jpeg' });
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(blobUrl);

            recordActivityEvent('image');
            playSound('receive');

            setMessages((prev) => prev.map((m) =>
              m.imageTransferId === transferId
                ? { ...m, data: blobUrl, imageProgress: undefined, imageTransferId: undefined, delivered: true }
                : m
            ));

            if (transfer.messageId && websocket.readyState === WebSocket.OPEN) {
              websocket.send(JSON.stringify({ type: 'receipt', messageId: transfer.messageId }));
            }
          }
          return;
        }

        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          msg = { system: event.data };
        }

        if (msg.type === 'config' && Number.isInteger(msg.reconnectGraceSeconds) && msg.reconnectGraceSeconds > 0) {
          reconnectGraceRef.current = msg.reconnectGraceSeconds;
        }

        if (msg.type === 'image_start') {
          const { id, messageId, messageIndex, totalChunks, totalBytes } = msg;
          if (!id || !Number.isSafeInteger(totalChunks) || totalChunks < 1) return;

          imageTransfersRef.current.set(id, {
            totalChunks,
            totalBytes,
            messageId: typeof messageId === 'string' ? messageId : null,
            chunks: new Array(totalChunks).fill(null),
            received: 0
          });

          const msgIndex = Number.isSafeInteger(messageIndex) ? messageIndex : nextMessageIndexRef.current++;
          setMessages((prev) => [
            ...prev.filter((item) => item.type !== 'typing'),
            {
              id: typeof messageId === 'string' ? messageId : `img_transfer_${id}`,
              index: msgIndex,
              originIndex: Number.isSafeInteger(messageIndex) ? messageIndex : null,
              author: 'peer',
              type: 'image',
              data: null,
              from: 'stranger',
              isMine: false,
              delivered: false,
              reactions: { self: null, peer: null },
              timestamp: Date.now(),
              imageProgress: 0,
              imageTransferId: id
            }
          ]);
          return;
        }

        if (msg.type === 'image_cancel') {
          const { id } = msg;
          imageTransfersRef.current.delete(id);
          setMessages((prev) => prev.map((m) =>
            m.imageTransferId === id ? { ...m, imageFailed: true, imageProgress: undefined, imageTransferId: undefined } : m
          ));
          return;
        }

        if (msg.type === 'announcement' && typeof msg.message === 'string') {
          setMessages((prev) => [
            ...prev.filter((item) => item.type !== 'typing'),
            { announcement: msg.message, timestamp: Date.now() }
          ]);
          return;
        }

        if (msg.type === 'stats' && msg.onlineCount !== undefined) {
          setOnlineCount(msg.onlineCount);
        }

        if (msg.type === 'feedbackResult') {
          setFeedbackStatus({
            type: msg.ok === true ? 'success' : 'error',
            message: typeof msg.message === 'string' ? msg.message : 'Không nhận được phản hồi từ server.'
          });
          return;
        }

        if (msg.type === 'receipt') {
          setMessages((prev) => prev.map((m) => (m.id === msg.messageId ? { ...m, delivered: true } : m)));
          return;
        }

        if (msg.type === 'reaction') {
          if (
            !Number.isSafeInteger(msg.messageIndex)
            || (msg.author !== 'self' && msg.author !== 'peer')
            || (msg.emoji !== null && !REACTION_EMOJIS.includes(msg.emoji))
          ) {
            return;
          }
          recordActivityEvent('reaction');
          const targetAuthor = msg.author === 'self' ? 'peer' : 'self';
          setMessages((prev) => prev.map((message) => (
            message.originIndex === msg.messageIndex && message.author === targetAuthor
              ? {
                ...message,
                reactions: { ...message.reactions, peer: msg.emoji },
                reactionAnimation: {
                  emoji: msg.emoji ?? message.reactions.peer,
                  revision: (message.reactionAnimation?.revision ?? 0) + 1
                }
              }
              : message
          )));
          return;
        }

        if (msg.system?.includes('Connected to a stranger')) {
          setIsUserConnected(true);
          setHasActiveConversation(true);
          if (!isReconnecting) {
            revokeAllBlobUrls();
            setMessages([]);
            nextMessageIndexRef.current = 0;
            setActivityEventCount(0);
            activityEventCountRef.current = 0;
            eventMilestoneTypesRef.current.clear();
          }
          isReconnecting = false;
          playSound('connect');
        }

        if (msg.system?.toLowerCase().includes('reconnected')) {
          setIsUserConnected(true);
          setHasActiveConversation(true);
          isReconnecting = false;
        }

        if (msg.system?.includes('Waiting for a stranger') || msg.system?.includes('No partner available')) {
          setIsUserConnected(false);
          setHasActiveConversation(false);
          if (msg.system.includes('Waiting for a stranger')) {
            isReconnecting = false;
          }
        }

        if (msg.system?.toLowerCase().includes('conversation ended')) {
          setIsUserConnected(false);
          setHasActiveConversation(false);
          isReconnecting = false;
          revokeAllBlobUrls();
        }

        if (msg.system?.toLowerCase().includes('connection lost')) {
          setIsUserConnected(false);
        }

        if (msg.system?.includes('disconnected')) {
          setIsUserConnected(false);
          setHasActiveConversation(false);
          revokeAllBlobUrls();
          playSound('disconnect');
        }

        if (msg.type === 'text' || msg.type === 'image') {
          if (msg.from === 'stranger') {
            recordActivityEvent(msg.type);
          }
          const soundType = msg.from === 'self' ? 'send' : 'receive';
          playSound(soundType);

          const incomingMessage = {
            id: msg.id,
            index: msg.from === 'self' && Number.isSafeInteger(msg.messageIndex)
              ? msg.messageIndex
              : nextMessageIndexRef.current++,
            originIndex: Number.isSafeInteger(msg.messageIndex) ? msg.messageIndex : null,
            author: msg.from === 'self' ? 'self' : 'peer',
            type: msg.type,
            data: msg.data,
            from: msg.from,
            isMine: msg.from === 'self',
            delivered: msg.from === 'self' ? false : true,
            reactions: { self: null, peer: null },
            timestamp: Date.now()
          };

          if (msg.from === 'stranger' && msg.id && websocket.readyState === WebSocket.OPEN) {
            websocket.send(
              JSON.stringify({
                type: 'receipt',
                messageId: msg.id
              })
            );
          }

          window.clearTimeout(typingTimeoutRef.current);

          setMessages((prev) => [
            ...prev.filter((item) => item.type !== 'typing'),
            incomingMessage
          ]);
        }

        if (msg.type === 'typing') {
          window.clearTimeout(typingTimeoutRef.current);
          setMessages((prev) => (
            prev.some((item) => item.type === 'typing')
              ? prev
              : [...prev, { id: 'typing-indicator', type: 'typing', timestamp: Date.now() }]
          ));
          typingTimeoutRef.current = window.setTimeout(() => {
            setMessages((prev) => prev.filter((item) => item.type !== 'typing'));
          }, 2000);
        }

        if (msg.system) {
          const isReconnect = msg.system.toLowerCase().includes('reconnected')
            || msg.system.toLowerCase().includes('connection restored');
          setMessages((prev) => [
            ...prev.map((message) => (
              isReconnect && message.reconnectSeconds && !message.reconnectEndedAt
                ? { ...message, reconnectEndedAt: Date.now() }
                : message
            )),
            {
              system: msg.system,
              timestamp: Date.now(),
              reconnectSeconds: Number.isInteger(msg.reconnectSeconds) && msg.reconnectSeconds > 0
                ? msg.reconnectSeconds
                : undefined,
              reconnectStartedAt: Number.isInteger(msg.reconnectSeconds) && msg.reconnectSeconds > 0
                ? Date.now()
                : undefined
            }
          ]);
        }
      };

      websocket.onclose = (event) => {
        if (disposed) return;

        window.clearInterval(keepaliveInterval);
        setWs(null);
        setIsUserConnected(false);
        if (event.code === 4001 && event.reason === 'Reconnected from this client') {
          setMessages((prev) => [
            ...prev,
            {
              system: '[SYSTEM] Phiên chat đã được tiếp tục ở một kết nối khác.',
              timestamp: Date.now()
            }
          ]);
          return;
        }

        isReconnecting = true;
        if (!hasLostConnection) {
          hasLostConnection = true;
          setMessages((prev) => [
            ...prev,
            {
              system: '[SYSTEM] Connection lost. Retrying…',
              timestamp: Date.now(),
              reconnectSeconds: reconnectGraceRef.current,
              reconnectStartedAt: Date.now()
            }
          ]);
        }
        reconnectTimeout = window.setTimeout(() => {
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 5000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        websocket.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimeout);
      window.clearInterval(keepaliveInterval);
      window.clearTimeout(typingTimeoutRef.current);
      revokeAllBlobUrls();
      if (websocket && websocket.readyState !== WebSocket.CLOSING && websocket.readyState !== WebSocket.CLOSED) {
        websocket.close();
      }
    };
  }, [playSound, recordActivityEvent, revokeAllBlobUrls, enabled]);

  const sendMessage = useCallback((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (data.type === 'text') {
        const messageIndex = nextMessageIndexRef.current++;
        ws.send(JSON.stringify({ ...data, messageIndex }));
        recordActivityEvent(data.type);
      } else {
        ws.send(JSON.stringify(data));
      }
    }
  }, [ws, recordActivityEvent]);

  const sendImage = useCallback(async (blob) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const messageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const localBlobUrl = URL.createObjectURL(blob);
    blobUrlsRef.current.push(localBlobUrl);

    const messageIndex = nextMessageIndexRef.current++;
    const totalBytes = blob.size;
    const CHUNK_SIZE = 64 * 1024;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
    const transferId = window.crypto.randomUUID();

    setMessages((prev) => [
      ...prev.filter((m) => m.type !== 'typing'),
      {
        id: messageId,
        index: messageIndex,
        originIndex: messageIndex,
        author: 'self',
        type: 'image',
        data: localBlobUrl,
        from: 'self',
        isMine: true,
        delivered: false,
        reactions: { self: null, peer: null },
        timestamp: Date.now(),
        imageProgress: 0
      }
    ]);

    ws.send(JSON.stringify({
      type: 'image_start',
      id: transferId,
      messageId,
      messageIndex,
      totalChunks,
      totalBytes
    }));
    recordActivityEvent('image');
    playSound('send');

    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (ws.readyState !== WebSocket.OPEN) break;
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const chunkData = uint8.subarray(start, end);

      const buffer = new ArrayBuffer(40 + chunkData.byteLength);
      const headerBytes = new Uint8Array(buffer, 0, 36);
      for (let i = 0; i < 36; i++) {
        headerBytes[i] = transferId.charCodeAt(i);
      }
      const view = new DataView(buffer);
      view.setUint32(36, chunkIndex, false);

      const bodyBytes = new Uint8Array(buffer, 40);
      bodyBytes.set(chunkData);

      ws.send(buffer);

      const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
      setMessages((prev) => prev.map((m) =>
        m.id === messageId ? { ...m, imageProgress: progress < 100 ? progress : undefined } : m
      ));
    }
  }, [ws, playSound, recordActivityEvent]);

  const sendReaction = useCallback((targetMessage, emoji) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'reaction',
        messageIndex: targetMessage.originIndex,
        author: targetMessage.author,
        emoji
      }));
      recordActivityEvent('reaction');
      setMessages((prev) => prev.map((message) => (
        message.index === targetMessage.index
          ? {
            ...message,
            reactions: { ...message.reactions, self: emoji },
            reactionAnimation: {
              emoji: emoji ?? message.reactions.self,
              revision: (message.reactionAnimation?.revision ?? 0) + 1
            }
          }
          : message
      )));
      return true;
    }
    return false;
  }, [ws, recordActivityEvent]);

  const sendFeedback = useCallback(({ feedback, username }) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setFeedbackStatus({ type: 'error', message: 'Chưa kết nối được server. Bạn thử lại sau nhé.' });
      return false;
    }
    ws.send(JSON.stringify({ type: 'feedback', data: feedback, username }));
    setFeedbackStatus({ type: 'pending', message: 'Đang gửi góp ý…' });
    return true;
  }, [ws]);

  const clearFeedbackStatus = useCallback(() => setFeedbackStatus(null), []);

  return {
    isUserConnected,
    hasActiveConversation,
    messages,
    sendMessage,
    sendImage,
    sendReaction,
    sendFeedback,
    feedbackStatus,
    clearFeedbackStatus,
    onlineCount,
    activityEventCount,
    eventMilestoneTypesRef
  };
};
