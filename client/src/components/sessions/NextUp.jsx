import { Video } from 'lucide-react';
import Button from '../common/Button.jsx';
import Card, { SectionLabel } from '../common/Card.jsx';
import { formatTime, isSameLocalDay, timeUntil } from '../../utils/sessionTiming.js';

/**
 * The session to join next, with a join button: the one that is live, or the
 * next one coming. `session` carries its `phase`; pass `emptyMessage` for
 * when there is nothing ahead.
 */
export default function NextUp({ session, now, onJoin, emptyMessage }) {
  if (!session) {
    return (
      <section className="rounded-xl border border-dashed border-ink-300 px-6 py-8 text-center">
        <p className="text-sm font-medium text-ink-900">Nothing coming up</p>
        <p className="mt-1 text-sm text-ink-500">{emptyMessage}</p>
      </section>
    );
  }

  const live = session.phase === 'live';
  const today = isSameLocalDay(session.startsAt, now);
  const when = live
    ? `Live now · ends at ${formatTime(session.endsAt)}`
    : `${today ? 'Today' : new Date(session.startsAt).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} · ${formatTime(session.startsAt)}–${formatTime(session.endsAt)}`;
  const startsIn = !live && timeUntil(session.startsAt, now);

  return (
    <Card
      as="section"
      className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      aria-labelledby="next-up-heading"
    >
      <div className="min-w-0">
        <SectionLabel as="p" className={`flex items-center gap-2 ${live ? 'text-emerald-700' : ''}`}>
          {live && <span className="size-1.5 animate-pulse rounded-full bg-emerald-600" aria-hidden="true" />}
          {live ? 'Happening now' : 'Next up'}
        </SectionLabel>
        <h2 id="next-up-heading" className="mt-1.5 truncate font-display text-2xl font-medium tracking-[-0.02em] text-ink-900">{session.title}</h2>
        <p className="mt-1 text-sm text-ink-600">
          {session.classroom?.name} · {when}
          {startsIn && <span className="font-medium text-ink-900"> · Starts {startsIn}</span>}
        </p>
      </div>
      <Button size="lg" className="shrink-0" onClick={() => onJoin(session)}>
        <Video className="size-5" aria-hidden="true" /> {live ? 'Join now' : 'Join session'}
      </Button>
    </Card>
  );
}
