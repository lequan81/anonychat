import { useRef, useCallback, useMemo } from 'react';

const useAudio = () => {
  const audioRefs = useRef({});

  // Define valid sound types
  const VALID_SOUND_TYPES = useMemo(
    () => ({
      CONNECT: 'connect',
      DISCONNECT: 'disconnect',
      SEND: 'send',
      RECEIVE: 'receive',
    }),
    []
  );

  // Helper to validate sound type
  const isValidSoundType = useCallback((type) => Object.values(VALID_SOUND_TYPES).includes(type), [VALID_SOUND_TYPES]);

  // Optimized audio file paths with format detection
  const getAudioPath = useCallback(
    (type) => {
      // Check if browser supports WebM/OGG first (better compression), fallback to MP3
      const audio = document.createElement('audio');
      let extension = audio.canPlayType('audio/ogg') ? '.ogg' : '.mp3'; // Default fallback

      switch (type) {
        case VALID_SOUND_TYPES.CONNECT:
        case VALID_SOUND_TYPES.DISCONNECT:
          return `/sounds/activity${extension}`;
        case VALID_SOUND_TYPES.SEND:
        case VALID_SOUND_TYPES.RECEIVE:
          return `/sounds/message${extension}`;
        default:
          return null;
      }
    },
    [VALID_SOUND_TYPES]
  );

  // Lazy load audio with preloading and caching
  const getAudio = useCallback(
    (type) => {
      if (!isValidSoundType(type)) {
        console.warn(`Invalid sound type: ${type}`);
        return null;
      }

      if (!audioRefs.current[type]) {
        const audioPath = getAudioPath(type);
        if (audioPath) {
          const audio = new Audio(audioPath);
          audio.preload = 'auto'; // Preload for better performance
          audio.volume = 0.7; // Set reasonable default volume
          audioRefs.current[type] = audio;

          // Handle load errors
          audio.onerror = () => {
            console.warn(`Failed to load audio: ${audioPath}`);
            audioRefs.current[type] = null;
          };
        }
      }
      return audioRefs.current[type];
    },
    [isValidSoundType, getAudioPath]
  );

  // Memoized playSound function to prevent unnecessary re-renders
  const playSound = useCallback(
    (type) => {
      try {
        const audio = getAudio(type);
        if (audio && audio.readyState >= 2) {
          // HAVE_CURRENT_DATA or better
          audio.currentTime = 0;
          const playPromise = audio.play();

          if (playPromise !== undefined) {
            playPromise.catch((e) => {
              // Handle autoplay restrictions gracefully
              if (e.name === 'NotAllowedError') {
                console.log('Audio autoplay blocked by browser');
              } else {
                console.log('Audio play failed:', e.message);
              }
            });
          }
        }
      } catch (error) {
        console.log('Audio error:', error.message);
      }
    },
    [getAudio]
  );

  return { playSound };
};

export default useAudio;
