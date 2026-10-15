import { useState, useEffect } from 'react';

/**
 * Tracks the mobile visual viewport height and dynamic virtual keyboard offset.
 * Prevents fixed containers from being obscured when on-screen keyboard appears.
 *
 * @returns {{ viewportHeight: number, keyboardOffset: number }}
 */
export function useVisualViewport() {
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const updateViewport = () => {
      const visualViewport = window.visualViewport;
      const height = visualViewport?.height || window.innerHeight;
      const offset = visualViewport ? Math.max(0, window.innerHeight - height) : 0;

      setViewportHeight(height);
      setKeyboardOffset(offset);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewport);
      window.visualViewport.addEventListener('scroll', updateViewport);
    } else {
      window.addEventListener('resize', updateViewport);
    }

    updateViewport();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewport);
        window.visualViewport.removeEventListener('scroll', updateViewport);
      } else {
        window.removeEventListener('resize', updateViewport);
      }
    };
  }, []);

  return { viewportHeight, keyboardOffset };
}

export default useVisualViewport;
