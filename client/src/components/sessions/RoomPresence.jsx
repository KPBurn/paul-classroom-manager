import { useLiveSessions } from '../../context/LiveSessionsContext.jsx';
import { describePresence, presenceNames } from '../../utils/liveSessions.js';

/**
 * Who is in a session's room right now, kept current by the live connection.
 * Shown for sessions people can walk into: live ones, and ones about to start.
 * Staff also see names. `always` shows "No one is in the room yet" for an empty room.
 */
export default function RoomPresence({ sessionId, always = false, className = '' }) {
  const { presence, status } = useLiveSessions();
  const current = presence[sessionId];
  // Without a connection the last known state may be wrong, so nothing is claimed.
  if (status !== 'live' || (!current && !always)) return null;
  const names = presenceNames(current);

  return (
    <p className={`text-xs ${current ? 'text-emerald-700' : 'text-ink-500'} ${className}`} aria-live="polite">
      {describePresence(current)}
      {names && <span className="block truncate text-ink-500" title={current.participants.map(({ name }) => name).join(', ')}>{names}</span>}
    </p>
  );
}

/** Says when live updates are not arriving, so a stale page is not mistaken for a quiet one. */
export function LiveStatusNote({ className = '' }) {
  const { status } = useLiveSessions();
  if (status === 'live' || status === 'connecting') return null;
  return (
    <p role="status" className={`text-xs text-amber-700 ${className}`}>
      {status === 'reconnecting'
        ? 'Reconnecting… live updates are paused.'
        : 'Live updates are off. Refresh the page to see changes.'}
    </p>
  );
}
