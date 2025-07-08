import { useState, useEffect, useRef, useContext } from 'react';
import { OnlineCountContext } from '@context/OnlineCountContext';
import { generateMessageId } from '@utils/date';

// Use Vite env variables with fallback defaults
const RETRY_DEBOUNCE = Number(import.meta.env.VITE_WS_RETRY_DEBOUNCE) || 800;
const RETRY_WINDOW_MS = Number(import.meta.env.VITE_WS_RETRY_WINDOW_MS) || 60000;
const MAX_ATTEMPTS_PER_WINDOW = Number(import.meta.env.VITE_WS_MAX_ATTEMPTS) || 3;
const COOLDOWN_MS = Number(import.meta.env.VITE_WS_COOLDOWN_MS) || 30000;
const HEARTBEAT_INTERVAL = Number(import.meta.env.VITE_WS_HEARTBEAT_INTERVAL) || 30000;
const HEARTBEAT_TIMEOUT = Number(import.meta.env.VITE_WS_HEARTBEAT_TIMEOUT) || 30000;
const TYPING_TIMEOUT = Number(import.meta.env.VITE_TYPING_TIMEOUT) || 2000;
const RECONNECT_DELAY = Number(import.meta.env.VITE_RECONNECT_DELAY) || 2000;
const MIN_CONNECTION_DURATION = Number(import.meta.env.VITE_MIN_CONNECTION_DURATION) || 5000;
const MAX_RECONNECT_DELAY = Number(import.meta.env.VITE_MAX_RECONNECT_DELAY) || 10000;
const RECONNECT_JITTER = Number(import.meta.env.VITE_RECONNECT_JITTER) || 1200;

const useWebSocket = (playSound) => {
  // console.log('useWebSocket hook called');

  // Split state into logical groups for clarity and performance
  const [connection, setConnection] = useState({
    ws: null,
    isConnected: false,
    isReconnecting: false,
    serverError: false,
    cooldownTimeLeft: 0,
    userId: null, // Add userId to connection state
  });
  const [chat, setChat] = useState({
    isStrangerConnected: false,
    messages: [],
    typingStatus: '',
  });

  // Refs for timers and retry state (keeping individual refs for clarity)
  const playSoundRef = useRef(playSound);
  const noPartnerTimeoutRef = useRef(null);
  const lastNoPartnerMsgRef = useRef(null);
  const retryState = useRef({
    attempts: 0,
    windowStart: Date.now(),
    isInCooldown: false,
    cooldownStart: null,
  });
  const reconnectTimeoutRef = useRef(null);
  const cooldownTimerRef = useRef(null);
  const wsRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const lastPongRef = useRef(Date.now());
  const connectionStartTimeRef = useRef(null);

  // Update playSoundRef when playSound changes
  playSoundRef.current = playSound;

  const { setOnlineCount } = useContext(OnlineCountContext);

  // Cleanup effect: close WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (noPartnerTimeoutRef.current) clearTimeout(noPartnerTimeoutRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  // Helper to update connection state
  const updateConnection = (newState) => setConnection((prev) => ({ ...prev, ...newState }));

  const startCooldownTimer = () => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setInterval(() => {
      const now = Date.now();
      const timeLeft = COOLDOWN_MS - (now - retryState.current.cooldownStart);
      if (timeLeft > 0) {
        updateConnection({ cooldownTimeLeft: Math.ceil(timeLeft / 1000) });
      } else {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
        console.log('Cooldown expired, resetting retry state and starting reconnection');
        retryState.current = {
          attempts: 0,
          windowStart: now,
          isInCooldown: false,
          cooldownStart: null,
        };
        updateConnection({ cooldownTimeLeft: 0 });
        // Check if we should reconnect after cooldown
        if (wsRef.current === null || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('Starting reconnection after cooldown');
          connect();
        }
      }
    }, 1000);
  };

  const canRetry = () => {
    const now = Date.now();
    const { attempts, windowStart, isInCooldown, cooldownStart } = retryState.current;

    if (isInCooldown) {
      // console.log(`Still in cooldown. ${Math.ceil((COOLDOWN_MS - (now - cooldownStart)) / 1000)}s remaining`);
      return false;
    }

    if (now - windowStart > RETRY_WINDOW_MS) {
      console.log('Retry window expired, resetting attempts');
      retryState.current.attempts = 0;
      retryState.current.windowStart = now;
      return true;
    }

    if (attempts >= MAX_ATTEMPTS_PER_WINDOW) {
      // console.log(`Max attempts (${MAX_ATTEMPTS_PER_WINDOW}) reached in window. Starting cooldown.`);
      retryState.current.isInCooldown = true;
      retryState.current.cooldownStart = now;

      // Clear any pending reconnect timeouts when starting cooldown
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      startCooldownTimer();
      return false;
    }

    return true;
  };

  const connect = () => {
    if (!canRetry()) return;

    // Close existing connection if any
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close(1000, 'Reconnecting');
    }

    retryState.current.attempts++;
    let wsUrl = import.meta.env.VITE_WEBSOCKET_URL;
    if (!wsUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}`;
    }

    // console.log(`WebSocket connection attempt ${retryState.current.attempts}/${MAX_ATTEMPTS_PER_WINDOW}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Handle WebSocket open event
    ws.onopen = () => {
      console.log('WebSocket connected successfully');
      // console.log('Connection attempt:', retryState.current.attempts, 'of', MAX_ATTEMPTS_PER_WINDOW);
      connectionStartTimeRef.current = Date.now(); // Track connection start time

      // Play connect sound
      if (playSoundRef.current) {
        playSoundRef.current('connect');
      }

      updateConnection({
        ws,
        isConnected: true,
        cooldownTimeLeft: 0,
        serverError: false,
      });
      retryState.current = {
        attempts: 0,
        windowStart: Date.now(),
        isInCooldown: false,
        cooldownStart: null,
      };
      heartbeatIntervalRef.current = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          // console.log('Sending heartbeat ping...');
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
          if (Date.now() - lastPongRef.current > HEARTBEAT_TIMEOUT) {
            // console.log('Heartbeat timeout, closing connection');
            wsRef.current.close();
          }
        }
      }, HEARTBEAT_INTERVAL);
    };

    // Handle WebSocket message event
    ws.onmessage = (event) => {
      lastPongRef.current = Date.now();
      let handled = false;
      try {
        const data = JSON.parse(event.data);

        // Main message type switch
        switch (data.type) {
          case 'connection_established':
            // Backend sends us our connection/user ID
            if (data.userId) {
              updateConnection({ userId: data.userId });
              // console.log('User ID assigned by backend:', data.userId);
            }
            handled = true;
            break;
          case 'pong':
            handled = true;
            break;
          case 'stats':
            if (typeof data.onlineCount === 'number' && setOnlineCount) setOnlineCount(data.onlineCount);
            handled = true;
            break;
          case 'typing':
            setChat((prev) => ({ ...prev, typingStatus: 'Stranger is typing…' }));
            if (window.__typingTimeout) clearTimeout(window.__typingTimeout);
            window.__typingTimeout = setTimeout(
              () => setChat((prev) => ({ ...prev, typingStatus: '' })),
              TYPING_TIMEOUT
            );
            handled = true;
            break;
          case 'text':
            if (data.from === 'stranger') {
              // Play receive sound for incoming messages
              if (playSoundRef.current) {
                playSoundRef.current('receive');
              }

              setChat((prev) => ({
                ...prev,
                isStrangerConnected: true,
                messages: [
                  ...prev.messages,
                  {
                    ...data,
                    isMine: false,
                    delivered: true,
                    timestamp: Date.now(),
                  },
                ],
              }));
            } else if (data.from === 'self') {
              // Update the delivery status of the message sent by the user
              setChat((prev) => ({
                ...prev,
                messages: prev.messages.map((m) => (m.id === data.id ? { ...m, delivered: true } : m)),
              }));
            }
            handled = true;
            break;
          case 'receipt':
            if (data.messageId) {
              setChat((prev) => ({
                ...prev,
                messages: prev.messages.map((m) => (m.id === data.messageId ? { ...m, delivered: true } : m)),
              }));
            }
            handled = true;
            break;
          case 'connection_rejected':
            setChat((prev) => ({
              ...prev,
              messages: [
                ...prev.messages,
                { system: data.reason || 'Connection rejected by server.', timestamp: Date.now() },
              ],
            }));
            updateConnection({ serverError: true, isConnected: false });
            if (wsRef.current) wsRef.current.close();
            handled = true;
            break;
          case 'system': {
            // Sub-switch for system message content
            let sysType = '';
            if (data.system.includes('No partner available')) sysType = 'no_partner';
            else if (data.system.includes('Connected to a stranger')) sysType = 'connected';
            else if (data.system.includes('Waiting for a stranger')) sysType = 'waiting';
            else if (data.system.includes('Stranger has disconnected')) sysType = 'disconnected';
            else if (
              data.system.includes('Invalid message format') ||
              data.system.includes('Message missing type field') ||
              data.system.includes('Unknown message type received')
            )
              sysType = 'error';

            switch (sysType) {
              case 'no_partner':
                if (noPartnerTimeoutRef.current) clearTimeout(noPartnerTimeoutRef.current);
                lastNoPartnerMsgRef.current = data.system;
                noPartnerTimeoutRef.current = setTimeout(() => {
                  setChat((prev) => {
                    const lastMsg = prev.messages[prev.messages.length - 1];
                    let newState = { ...prev, isStrangerConnected: false };
                    if (lastMsg && lastMsg.system === data.system) return prev;
                    return {
                      ...newState,
                      messages: [...prev.messages, { system: data.system, timestamp: Date.now() }],
                    };
                  });
                  noPartnerTimeoutRef.current = null;
                  lastNoPartnerMsgRef.current = null;
                }, RECONNECT_DELAY);
                break;
              case 'connected':
              case 'waiting':
                if (noPartnerTimeoutRef.current) {
                  clearTimeout(noPartnerTimeoutRef.current);
                  noPartnerTimeoutRef.current = null;
                  lastNoPartnerMsgRef.current = null;
                }

                // Play connect sound when stranger connects
                if (sysType === 'connected' && playSoundRef.current) {
                  playSoundRef.current('connect');
                }

                setChat((prev) => {
                  const lastMsg = prev.messages[prev.messages.length - 1];
                  let newState = { ...prev };
                  if (lastMsg && lastMsg.system === data.system) return prev;
                  if (sysType === 'connected') newState.isStrangerConnected = true;
                  if (sysType === 'waiting') newState.isStrangerConnected = false;
                  return {
                    ...newState,
                    messages: [...prev.messages, { system: data.system, timestamp: Date.now() }],
                  };
                });
                break;
              case 'disconnected':
                // Play disconnect sound when stranger disconnects
                if (playSoundRef.current) {
                  playSoundRef.current('disconnect');
                }

                setChat((prev) => ({
                  ...prev,
                  isStrangerConnected: false,
                  typingStatus: '', // Clear typing indicator when stranger disconnects
                  messages: [...prev.messages, { system: data.system, timestamp: Date.now() }],
                }));
                break;
              case 'error':
                setChat((prev) => ({
                  ...prev,
                  messages: [...prev.messages, { system: data.system, timestamp: Date.now() }],
                }));
                break;
              default:
                setChat((prev) => ({
                  ...prev,
                  messages: [...prev.messages, { system: data.system, timestamp: Date.now() }],
                }));
                break;
            }
            handled = true;
            break;
          }
          default:
            break;
        }
        if (!handled) {
          console.warn('Unknown message type:', data.type, 'Raw message:', event.data);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error, event.data);
        updateConnection({ serverError: true });
        setChat((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              system: '[SYSTEM] Error parsing message from server.',
              timestamp: Date.now(),
            },
          ],
        }));
        if (noPartnerTimeoutRef.current) {
          clearTimeout(noPartnerTimeoutRef.current);
          noPartnerTimeoutRef.current = null;
          lastNoPartnerMsgRef.current = null;
        }
      }
    };

    // Handle WebSocket error event
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      updateConnection({ isConnected: false });
    };

    // Handle WebSocket close event with minimum connection duration
    ws.onclose = (event) => {
      // console.log('WebSocket closed:', event.code, event.reason);
      // console.log(
      //   'Connection duration:',
      //   connectionStartTimeRef.current ? Date.now() - connectionStartTimeRef.current : 0,
      //   'ms'
      // );
      updateConnection({
        isConnected: false,
        ws: null,
        isReconnecting: true,
      });
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

      // Don't reconnect if the close was deliberate (code 1000 with "Reconnecting" reason)
      if (event.code === 1000 && event.reason === 'Reconnecting') {
        // console.log('Connection closed for reconnection, not auto-reconnecting');
        updateConnection({ isReconnecting: false });
        return;
      }

      // Re-enable auto-reconnection with improved logic
      const connectionDuration = connectionStartTimeRef.current ? Date.now() - connectionStartTimeRef.current : 0;
      const minConnectionDuration = MIN_CONNECTION_DURATION; // 5 seconds minimum
      const delayBeforeReconnect = Math.max(minConnectionDuration - connectionDuration, 0);

      // console.log(
      //   `Connection duration: ${connectionDuration}ms, minimum: ${minConnectionDuration}ms, delay: ${delayBeforeReconnect}ms`
      // );

      setTimeout(() => {
        if (canRetry()) {
          if (!reconnectTimeoutRef.current) {
            let reconnectDelay = RETRY_DEBOUNCE;
            if (retryState.current.attempts > 1) {
              reconnectDelay = Math.min(
                reconnectDelay * Math.pow(2, retryState.current.attempts - 1),
                MAX_RECONNECT_DELAY
              ); // max delay from env
            }
            // console.log(
            //   `Scheduling reconnect in ${reconnectDelay}ms (after ${delayBeforeReconnect}ms minimum duration delay)`
            // );
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              // console.log('Executing reconnect...');
              connect();
            }, reconnectDelay);
          }
          updateConnection({ serverError: false });
        } else {
          console.log('Cannot retry - either in cooldown or max attempts reached');
          updateConnection({ serverError: true });
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        }
        updateConnection({ isReconnecting: false });
      }, delayBeforeReconnect + RECONNECT_JITTER);
    };
  };
  // Single connection effect that handles StrictMode properly
  useEffect(() => {
    let isMounted = true;

    // In StrictMode, effects run twice. We need to prevent double connections.
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      // console.log('WebSocket already connected or connecting, skipping duplicate connection');
      return;
    }

    // console.log('Initiating WebSocket connection...');

    // Only connect if still mounted
    if (isMounted) {
      connect();
    }

    return () => {
      isMounted = false;
      // console.log('Cleaning up WebSocket connection effect');
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (noPartnerTimeoutRef.current) clearTimeout(noPartnerTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = (message) => {
    if (connection.ws && connection.isConnected) {
      if (message.type === 'text' && message.data) {
        const messageId = message.id || generateMessageId();

        // Play send sound when user sends a message
        if (playSoundRef.current) {
          playSoundRef.current('send');
        }

        setChat((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              type: 'text',
              data: message.data,
              from: 'self',
              isMine: true,
              delivered: false,
              id: messageId,
              timestamp: Date.now(),
            },
          ],
        }));
        connection.ws.send(JSON.stringify({ ...message, id: messageId }));
      } else {
        connection.ws.send(JSON.stringify(message));
      }
    } else {
      console.warn('WebSocket not connected, message not sent');
    }
  };

  return {
    ...connection,
    ...chat,
    sendMessage,
  };
};

export default useWebSocket;
