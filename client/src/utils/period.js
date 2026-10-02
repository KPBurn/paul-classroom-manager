/** Midnight, local time, at the start of the given day. */
export function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** The same time of day, `days` later (or earlier when negative). Follows the calendar across clock changes. */
export function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

/** Midnight at the start of a `YYYY-MM-DD` value from a date input, in local time. */
export const dateInputToDate = (value) => new Date(`${value}T00:00`);

/** A date as the `YYYY-MM-DD` value a date input expects, in local time. */
export function dateInputValue(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Query parameters for listing sessions in a period: those that end after
 * `from` and start before `to`. Either end may be left open.
 */
export const periodParams = (from, to) => ({
  ...(from && { from: new Date(from).toISOString() }),
  ...(to && { to: new Date(to).toISOString() }),
});
