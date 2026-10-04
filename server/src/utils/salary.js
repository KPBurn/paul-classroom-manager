/**
 * Salary rules, as pure functions so the money is easy to reason about and test.
 *
 * A class pays a rate for its whole scheduled duration. A teacher who was in the
 * room for part of it earns the same rate pro rata, and a class nobody attended
 * earns nothing. Attendance comes from the session room: joining starts the
 * clock, leaving stops it.
 */

/** What a class pays when the teacher attends the whole session. */
export const DEFAULT_SESSION_RATE = 100;

/** How earnings can be grouped on the salary pages. */
export const SALARY_GRANULARITIES = ['day', 'week', 'month'];

const BUCKET_KEYS = { day: 'dayKey', week: 'weekKey', month: 'monthKey' };

/** Money is always kept to two decimals. */
export const roundAmount = (value) => Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;

/** The attendance entry recorded for someone in a session, if there is one. */
export function attendanceEntryFor(session, userId) {
  const wanted = String(userId);
  return (session?.attendance ?? []).find((entry) => String(
    entry.participant?._id ?? entry.participant ?? entry.student?._id ?? entry.student,
  ) === wanted);
}

/** Time someone spent in the room, counting a visit that is still going. */
export function attendedMsFor(session, userId, now = new Date()) {
  const entry = attendanceEntryFor(session, userId);
  if (!entry) return 0;
  const endsAt = new Date(session.endsAt).getTime();
  const stillInRoom = entry.activeSince
    ? Math.max(0, Math.min(new Date(now).getTime(), endsAt) - new Date(entry.activeSince).getTime())
    : 0;
  return (entry.durationMs ?? 0) + stillInRoom;
}

/** The rate a session pays: the one it was scheduled with, or the school default. */
export const sessionRateFor = (session, defaultRate = DEFAULT_SESSION_RATE) =>
  roundAmount(session?.rate ?? defaultRate ?? DEFAULT_SESSION_RATE);

/**
 * What a class pays one teacher for the whole session, from the most specific
 * rate down: the teacher's individual rate (assigned by an administrator), the
 * rate set on that scheduled class, the classroom's rate (also assigned by an
 * administrator), and finally the school default.
 */
export function rateForClass({
  teacherRate,
  sessionRate,
  classroomRate,
  defaultRate = DEFAULT_SESSION_RATE,
} = {}) {
  const chosen = [teacherRate, sessionRate, classroomRate]
    .find((value) => value !== null && value !== undefined);
  return roundAmount(chosen ?? defaultRate ?? DEFAULT_SESSION_RATE);
}

/**
 * What one session earned its teacher. `share` is 1 when they were in the room
 * for the whole session, and the amount follows it.
 */
export function earningsForSession(session, userId, { teacherRate, classroomRate, defaultRate, now = new Date() } = {}) {
  const rate = rateForClass({ teacherRate, sessionRate: session?.rate, classroomRate, defaultRate });
  const durationMs = Math.max(0, new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime());
  const attendedMs = attendedMsFor(session, userId, now);
  const share = durationMs > 0 ? Math.min(1, attendedMs / durationMs) : 0;
  return { rate, durationMs, attendedMs, share, amount: roundAmount(rate * share) };
}

/** Today, this week and this month, for lines that carry calendar keys. */
export function calendarTotals(lines, keys) {
  const totals = { today: 0, week: 0, month: 0 };
  for (const line of lines) {
    if (line.dayKey === keys.day) totals.today += line.amount;
    if (line.weekKey === keys.week) totals.week += line.amount;
    if (line.monthKey === keys.month) totals.month += line.amount;
  }
  return { today: roundAmount(totals.today), week: roundAmount(totals.week), month: roundAmount(totals.month) };
}

/** Lines grouped by day, week or month, newest group first. */
export function earningsBuckets(lines, granularity = 'day') {
  const keyName = BUCKET_KEYS[granularity] ?? BUCKET_KEYS.day;
  const buckets = new Map();
  for (const line of lines) {
    const key = line[keyName];
    const bucket = buckets.get(key) ?? { key, startedAt: line.startsAt, classes: 0, attendedMs: 0, earnings: 0 };
    bucket.classes += 1;
    bucket.attendedMs += line.attendedMs;
    bucket.earnings += line.amount;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, earnings: roundAmount(bucket.earnings) }))
    .sort((left, right) => (left.key < right.key ? 1 : -1));
}