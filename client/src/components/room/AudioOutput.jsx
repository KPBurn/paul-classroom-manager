import { useEffect, useRef } from 'react';

/**
 * Plays one remote audio stream. Browsers may refuse to start sound before the
 * person has clicked on the page; `onBlocked` reports that so the room can ask.
 */
export default function AudioOutput({ stream, onBlocked, elementKey, registerElement }) {
  const audioRef = useRef(null);

  useEffect(() => {
    registerElement(elementKey, audioRef.current);
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch((error) => {
        onBlocked(error.name === 'NotAllowedError'
          ? 'Your browser is blocking audio playback. Click in the room to allow sound.'
          : 'Unable to play participant audio.');
      });
    }
    return () => registerElement(elementKey, null);
  }, [elementKey, onBlocked, registerElement, stream]);

  return <audio ref={audioRef} autoPlay playsInline />;
}
