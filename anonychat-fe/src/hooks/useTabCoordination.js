import { useState, useEffect, useRef, useCallback } from 'react';

const TAB_CHANNEL_NAME = 'anonychat_tab_coordination';

export const useTabCoordination = () => {
  const [isPrimaryTab, setIsPrimaryTab] = useState(true);
  const tabIdRef = useRef(window.crypto.randomUUID());
  const channelRef = useRef(null);

  const claimPrimary = useCallback(() => {
    setIsPrimaryTab(true);
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'CLAIM_PRIMARY',
        tabId: tabIdRef.current
      });
    }
    try {
      window.localStorage.setItem('anonychat_active_tab', tabIdRef.current);
    } catch {
      // Storage access blocked or unavailable in private browsing
    }
  }, []);

  useEffect(() => {
    claimPrimary();

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(TAB_CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = (event) => {
        if (event.data?.type === 'CLAIM_PRIMARY' && event.data.tabId !== tabIdRef.current) {
          setIsPrimaryTab(false);
        }
      };

      return () => {
        channel.close();
      };
    } else {
      // Fallback using storage event
      const onStorage = (event) => {
        if (event.key === 'anonychat_active_tab' && event.newValue !== tabIdRef.current) {
          setIsPrimaryTab(false);
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener('storage', onStorage);
      };
    }
  }, [claimPrimary]);

  return {
    isPrimaryTab,
    claimPrimary
  };
};
