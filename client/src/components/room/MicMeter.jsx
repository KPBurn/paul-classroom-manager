import { SPEAKING_START_LEVEL, useMicLevel } from './useSpeakingDetector.js';

const BARS = [0.12, 0.25, 0.4, 0.58, 0.78];

/** Shows that the microphone is on and whether it is picking up sound. */
export default function MicMeter({ levelStore }) {
  const level = useMicLevel(levelStore);
  const active = level >= SPEAKING_START_LEVEL;
  return (
    <div
      className="flex h-10 items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3"
      role="status"
      aria-label={active ? 'Microphone is picking up sound' : 'Microphone is on, no sound detected'}
      title={active ? 'Microphone is picking up sound' : 'Microphone is on — speak to test'}
    >
      <span className="hidden text-xs text-ink-300 sm:inline">{active ? 'Mic active' : 'Mic on'}</span>
      <span className="sr-only">{active ? 'Microphone is picking up sound' : 'Speak to test your microphone'}</span>
      <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
        {BARS.map((threshold, index) => (
          <span
            key={threshold}
            className={`w-1 rounded-full transition-colors ${level >= threshold ? 'bg-emerald-400' : 'bg-ink-600'}`}
            style={{ height: `${6 + index * 3}px` }}
          />
        ))}
      </span>
    </div>
  );
}
