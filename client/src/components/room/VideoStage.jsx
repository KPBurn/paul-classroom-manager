import { useEffect, useRef } from 'react';

/**
 * A live video with a name label. Camera video is mirrored for every viewer,
 * so others see you as you see yourself; a shared screen is never mirrored.
 */
export default function VideoStage({ stream, label, muted = true, kind = 'screen' }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative flex h-full min-h-0 w-full items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        muted={muted}
        playsInline
        aria-label={kind === 'screen' ? `Screen shared by ${label}` : `Camera video from ${label}`}
        className={kind === 'camera' ? 'h-full w-full -scale-x-100 object-cover' : 'max-h-full max-w-full rounded-lg object-contain'}
      />
      <p className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
        {kind === 'screen' ? `${label} is sharing their screen` : label}
      </p>
    </div>
  );
}
