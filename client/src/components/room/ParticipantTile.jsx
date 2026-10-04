import { MicOff, Volume2 } from 'lucide-react';
import VideoStage from './VideoStage.jsx';

export const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

// `grid` is the main gallery, `feed` the bottom row of feeds while presenting, and
// `pane` one of the four tiles in the class monitor.
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
  // A fixed-height row: the tile's height comes from the row, its width from the ratio.
  feed: {
    frame: 'aspect-video h-full shrink-0',
    idleBorder: 'border-ink-700',
    placeholder: 'gap-1',
    avatar: 'size-8 text-xs',
    name: 'text-center',
    speaking: 'left-1.5 top-1.5 px-1.5 py-1 text-[10px]',
    speakingIcon: 'size-3',
  },
  pane: {
    frame: 'aspect-video min-w-0',
    idleBorder: 'border-ink-700',
    placeholder: 'gap-1',
    avatar: 'size-8 text-xs',
    name: 'text-center',
    speaking: 'left-1.5 top-1.5 px-1.5 py-1 text-[10px]',
    speakingIcon: 'size-3',
  },
};

/**
 * One person in the room: their camera when it is on, otherwise their
 * initials, with a green ring while they are speaking. `participant` carries
 * `name`, `stream`, `cameraEnabled`, `muted` and `isSpeaking`.
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
          {size === 'grid' && (
            <span className={`text-xs ${participant.cameraEnabled ? 'text-amber-300' : ''}`}>
              {participant.cameraEnabled ? 'Camera on · waiting for video' : 'Camera off'}
            </span>
          )}
        </div>
      )}
      {participant.isSpeaking && (
        <span className={`absolute flex items-center gap-1 rounded-md bg-emerald-500/90 font-semibold text-white ${styles.speaking}`}>
          <Volume2 className={styles.speakingIcon} aria-hidden="true" />
          {size === 'grid' && ' Speaking'}
        </span>
      )}
      {size === 'pane' && participant.muted && (
        <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 p-1 text-ink-200" title="Microphone off">
          <MicOff className="size-3" aria-hidden="true" />
          <span className="sr-only">Microphone off</span>
        </span>
      )}
    </div>
  );
}
