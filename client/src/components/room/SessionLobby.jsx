import { ArrowLeft, UsersRound, Video } from 'lucide-react';
import Alert from '../common/Alert.jsx';
import Button from '../common/Button.jsx';
import { useNow } from '../../hooks/useNow.js';
import { describePresence } from '../../utils/liveSessions.js';
import { lobbyMeeting, MEETING_PROVIDER_LABELS } from '../../utils/meetingProvider.js';
import { formatTime, isJoinable, sessionPhase, timeUntil } from '../../utils/sessionTiming.js';
import ZoomOption from './ZoomOption.jsx';

/**
 * What the lobby says about each state a session can be in, and whether the
 * room can be entered. `heldInRoom` is false for a class held in Zoom, which has
 * no room to wait in or open.
 */
function lobbyState(session, phase, now, canManageRoom, heldInRoom) {
  if (phase === 'closed') {
    return canManageRoom
      ? { tone: 'amber', label: 'Class ended', detail: 'You ended this class. Students cannot join until you reopen it from the room.', action: 'Open the room' }
      : { tone: 'neutral', label: 'Class ended', detail: 'The teacher has ended this class.', action: null };
  }
  if (phase === 'ended') {
    return {
      tone: 'neutral',
      label: 'Session over',
      detail: heldInRoom
        ? 'The scheduled time has passed. You can still open the room, but attendance is no longer recorded.'
        : 'The scheduled time has passed.',
      action: 'Open the room',
    };
  }
  if (phase === 'live') {
    return { tone: 'emerald', label: 'Live now', detail: `This class is in session until ${formatTime(session.endsAt)}.`, action: 'Join class' };
  }
  return {
    tone: 'amber',
    label: 'You’re early',
    detail: `Class starts at ${formatTime(session.startsAt)}${timeUntil(session.startsAt, now) ? ` (${timeUntil(session.startsAt, now)})` : ''}.`
      + (heldInRoom ? ' You can wait in the room; attendance starts when the class does.' : ''),
    action: 'Join early',
  };
}

const TONES = {
  emerald: { text: 'text-emerald-300', dot: 'bg-emerald-400' },
  amber: { text: 'text-amber-300', dot: 'bg-amber-400' },
  neutral: { text: 'text-ink-400', dot: 'bg-ink-500' },
};

/** For the class's teachers: whether the class is held in its class room or in Zoom. */
function ProviderChoice({ value, zoomChoosable, busy, onChoose }) {
  return (
    <fieldset className="mt-5" disabled={busy}>
      <legend className="text-sm font-medium">Hold this class in</legend>
      <div role="radiogroup" aria-label="Hold this class in" className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-ink-900 p-1">
        {Object.entries(MEETING_PROVIDER_LABELS).map(([provider, label]) => {
          const selected = value === provider;
          return (
            <button
              key={provider}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={busy || (provider === 'zoom' && !zoomChoosable && !selected)}
              onClick={() => !selected && onChoose(provider)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                selected ? 'bg-ink-100 text-ink-950' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-ink-400">Students only see and enter the one you choose.</p>
    </fieldset>
  );
}

/**
 * The screen before the class: what the session is, whether it has started,
 * and the way in the teacher chose for it, kept current while it is open.
 * A class held in its room shows who is there and its Join button; a class
 * held in Zoom shows only Zoom. Nobody is in the room, or counted as
 * attending, until they choose to join.
 */
export default function SessionLobby({
  session,
  presence,
  canManageRoom,
  connected,
  reconnecting,
  joining,
  error,
  choosingProvider = false,
  onChooseProvider,
  onJoin,
  onBack,
}) {
  const now = useNow(10_000);
  const phase = sessionPhase(session, now);
  const meeting = lobbyMeeting(session, { canManageRoom });
  const state = lobbyState(session, phase, now, canManageRoom, meeting.offersRoom);
  const tone = TONES[state.tone];
  const teachers = (session.assignments?.teachers ?? []).map((teacher) => teacher.name).filter(Boolean);
  const enterable = phase !== 'closed' || canManageRoom;
  const joinable = isJoinable(phase);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-950 px-4 py-8 text-ink-100">
      <div className="w-full max-w-md">
        <p className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wider ${tone.text}`} role="status">
          <span className={`size-2 rounded-full ${tone.dot} ${phase === 'live' ? 'animate-pulse' : ''}`} aria-hidden="true" />
          {state.label}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.01em]">{session.title}</h1>
        <p className="mt-1 text-sm text-ink-400">{state.detail}</p>

        <dl className="mt-6 divide-y divide-ink-800 border-y border-ink-800 text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-ink-400">Classroom</dt>
            <dd className="min-w-0 truncate text-right">{session.classroom?.name}</dd>
          </div>
          {teachers.length > 0 && (
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-ink-400">{teachers.length > 1 ? 'Teachers' : 'Teacher'}</dt>
              <dd className="min-w-0 truncate text-right">{teachers.join(', ')}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-ink-400">Time</dt>
            <dd className="text-right tabular-nums">
              {new Date(session.startsAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}{formatTime(session.startsAt)}–{formatTime(session.endsAt)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-ink-400">Held in</dt>
            <dd className="text-right">{MEETING_PROVIDER_LABELS[meeting.provider]}</dd>
          </div>
        </dl>

        {joinable && meeting.canChoose && onChooseProvider && (
          <ProviderChoice
            value={meeting.provider}
            zoomChoosable={meeting.zoomChoosable}
            busy={choosingProvider}
            onChoose={onChooseProvider}
          />
        )}

        {meeting.offersRoom && enterable && (
          <section className="mt-5" aria-labelledby="lobby-presence">
            <h2 id="lobby-presence" className="flex items-center gap-2 text-sm font-medium">
              <UsersRound className="size-4 text-ink-400" aria-hidden="true" />
              In the room
              {connected && presence?.count > 0 && <span className="tabular-nums text-ink-400">({presence.count})</span>}
            </h2>
            <p className="mt-1.5 text-sm text-ink-300" aria-live="polite">
              {connected ? describePresence(presence) : reconnecting ? 'Reconnecting…' : 'Connecting…'}
            </p>
            {/* Names are only sent to the class's teachers. */}
            {connected && presence?.participants?.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {presence.participants.map((participant) => (
                  <li key={participant.userId} className="rounded-full bg-ink-800 px-2.5 py-1 text-xs text-ink-200">
                    {participant.name}
                    {participant.role !== 'student' && <span className="text-ink-400"> · {participant.role}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* A class held in Zoom is only offered in Zoom, while it is on or still to come. */}
        {meeting.zoomState && joinable && <ZoomOption session={session} state={meeting.zoomState} canManageRoom={canManageRoom} />}

        {error && <div className="mt-5"><Alert tone="error">{error}</Alert></div>}

        <div className="mt-7 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          {meeting.offersRoom && state.action && (
            <Button variant="inverse" size="lg" onClick={onJoin} isLoading={joining} disabled={!connected}>
              {!joining && <Video className="size-5" aria-hidden="true" />}
              {joining ? 'Joining…' : state.action}
            </Button>
          )}
          <Button variant="dark" size="lg" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back
          </Button>
        </div>
      </div>
    </main>
  );
}
