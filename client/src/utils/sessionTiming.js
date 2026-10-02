/** How long before the start a session is shown as "starting soon". */
export const STARTING_SOON_MS = 15 * 60 * 1000;

/**
 * Where a session stands right now: cancelled, closed (a teacher ended it
 * early), ended, live, soon, or upcoming.
 */
export function sessionPhase(session, now = Date.now()) {
  if (session.status === 'cancelled') return 'cancelled';
  const startsAt = new Date(session.startsAt).getTime();
  const endsAt = new Date(session.endsAt).getTime();
  if (now >= endsAt) return 'ended';
  if (session.endedAt) return 'closed';
  if (now >= startsAt) return 'live';
  if (startsAt - now <= STARTING_SOON_MS) return 'soon';
  return 'upcoming';
}

/** Sessions people can still join: not cancelled, closed or over. */
export const isJoinable = (phase) => phase === 'live' || phase === 'soon' || phase === 'upcoming';

export const PHASE_LABELS = {
  cancelled: 'Cancelled',
  closed: 'Class ended',
  ended: 'Ended',
  live: 'Live now',
  soon: 'Starting soon',
  upcoming: 'Upcoming',
};

/** The `Badge` tone for each phase. */
export const PHASE_TONES = {
  cancelled: 'neutral',
  closed: 'neutral',
  ended: 'neutral',
  live: 'success',
  soon: 'warning',
  upcoming: 'info',
};

export const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const isSameLocalDay = (a, b) => {
  const first = new Date(a);
  const second = new Date(b);
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
};

/** "in 12 min", "in 2 h 5 min", or "" once the time has passed. */
export function timeUntil(value, now = Date.now()) {
  const minutes = Math.ceil((new Date(value).getTime() - now) / 60_000);
  if (minutes <= 0) return '';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
}
