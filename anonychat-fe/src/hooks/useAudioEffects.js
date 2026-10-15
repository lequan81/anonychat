import { useRef, useEffect, useCallback } from 'react';

export const useAudioEffects = () => {
  const hasInteractedRef = useRef(false);
  const audioRefs = useRef({
    connect: new Audio('/sounds/activity.mp3'),
    disconnect: new Audio('/sounds/activity.mp3'),
    send: new Audio('/sounds/message.mp3'),
    receive: new Audio('/sounds/message.mp3')
  });

  useEffect(() => {
    const markInteracted = () => {
      hasInteractedRef.current = true;
      window.removeEventListener('pointerdown', markInteracted);
      window.removeEventListener('keydown', markInteracted);
    };
    window.addEventListener('pointerdown', markInteracted);
    window.addEventListener('keydown', markInteracted);
    return () => {
      window.removeEventListener('pointerdown', markInteracted);
      window.removeEventListener('keydown', markInteracted);
    };
  }, []);

  const playSound = useCallback((type) => {
    if (!hasInteractedRef.current) return;
    try {
      const audio = audioRefs.current[type];
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => undefined);
      }
    } catch {
      // Audio playback ignored
    }
  }, []);

  return { playSound };
};
