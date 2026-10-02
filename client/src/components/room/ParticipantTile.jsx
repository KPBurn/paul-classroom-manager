import { Volume2 } from 'lucide-react';
import VideoStage from './VideoStage.jsx';

export const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

// `grid` is the main gallery; `strip` is the row of small tiles beside a shared screen.
const SIZES = {
  grid: {
    frame: 'min-h-0 min-w-0',
    idleBorder: 'border-ink-800',
    placeholder: 'gap-2',
    avatar: 'size-12 text-sm',
    name: '',
    speaking: 'left-2 top-2 px-2 py-1 text-xs',
    speakingIcon: 'size-3.5',
  },
  strip: {
    frame: 'aspect-video h-full shrink-0 sm:h-auto sm:min-h-20',
    idleBorder: 'border-ink-700',
    placeholder: 'gap-1 sm:gap-2',
    avatar: 'size-8 text-xs sm:size-10 sm:text-sm',
    name: 'text-center',
    speaking: 'left-1.5 top-1.5 px-1.5 py-1 text-[10px]',
    speakingIcon: 'size-3',
  },
};

/**
 * One person in the room: their camera when it is on, otherwise their
 * initials, with a green ring while they are speaking. `participant` carries
 * `name`, `stream`, `cameraEnabled` and `isSpeaking`.
 */
export default function ParticipantTile({ participant, isLocal = false, size = 'grid' }) {
  const styles = SIZES[size];
  const label = `${participant.name}${isLocal ? ' (You)' : ''}`;
  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-ink-900 ${styles.frame} ${participant.isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/70' : styles.idleBorder}`}
    >
      {participant.stream ? (
        <VideoStage stream={participant.stream} label={label} kind="camera" />
      ) : (
        <div className={`flex h-full w-full flex-col items-center justify-center text-ink-400 ${styles.placeholder}`}>
          <span className={`flex items-center justify-center rounded-full bg-ink-700 font-semibold text-ink-100 ${styles.avatar}`}>
            {initials(participant.name)}
          </span>
          <span className={`max-w-full truncate px-2 text-xs font-medium text-ink-100 ${styles.name}`}>{label}</span>
          {size === 'grid' ? (
            <span className={`text-xs ${participant.cameraEnabled ? 'text-amber-300' : ''}`}>
              {participant.cameraEnabled ? 'Camera on · waiting for video' : 'Camera off'}
            </span>
          ) : (
            <span className="hidden text-[10px] text-amber-300 sm:inline">Camera on · waiting for video</span>
          )}
        </div>
      )}
      {participant.isSpeaking && (
        <span className={`absolute flex items-center gap-1 rounded-md bg-emerald-500/90 font-semibold text-white ${styles.speaking}`}>
          <Volume2 className={styles.speakingIcon} aria-hidden="true" />
          {size === 'grid' && ' Speaking'}
        </span>
      )}
    </div>
  );
}
