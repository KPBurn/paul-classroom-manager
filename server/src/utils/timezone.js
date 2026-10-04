/**
 * Calendar helpers for reporting. A timetable is authored on the classroom's own
 * clock, so earnings are grouped by that clock rather than by UTC: an evening
 * class in Asia/Manila belongs to that day, not to the next one in UTC.
 */

export function isValidTimezone(timezone) {
  if (typeof timezone !== 'string' || !timezone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function assertTimezone(timezone) {
  if (!isValidTimezone(timezone)) throw new Error(`Unknown timezone: ${timezone}`);
}

/** The `YYYY-MM-DD` date an instant falls on in `timezone`. */
export function localDateKey(instant, timezone = 'UTC') {
  assertTimezone(timezone);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant))
    .filter((part) => part.type !== 'literal')
    .map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The `YYYY-MM` month an instant falls in. */
export const localMonthKey = (instant, timezone = 'UTC') => localDateKey(instant, timezone).slice(0, 7);

/** The ISO-8601 week (`YYYY-Www`, Monday first) an instant falls in. */
export function localWeekKey(instant, timezone = 'UTC') {
  const [year, month, day] = localDateKey(instant, timezone).split('-').map(Number);
  // The Thursday of the same week decides both the week number and the week's year.
  const thursday = new Date(Date.UTC(year, month - 1, day));
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const weekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  const week = 1 + Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

/** The "today", "this week" and "this month" keys to compare a period against. */
export function calendarKeys(now, timezone = 'UTC') {
  return {
    day: localDateKey(now, timezone),
    week: localWeekKey(now, timezone),
    month: localMonthKey(now, timezone),
  };
}

/** Attaches the three calendar keys to a line, so it can be totalled or grouped. */
export function withCalendarKeys(line, timezone, startedAt) {
  return {
    ...line,
    dayKey: localDateKey(startedAt, timezone),
    weekKey: localWeekKey(startedAt, timezone),
    monthKey: localMonthKey(startedAt, timezone),
  };
}