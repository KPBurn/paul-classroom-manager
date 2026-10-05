/** Weekly times, for teacher availability and class schedules. Days are JavaScript day numbers; times are "HH:mm". */
export const WEEKDAYS = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "09:00" as the reader's locale writes a time, such as "9:00 AM". */
export function formatTime(time) {
  const [hour, minute] = time.split(':').map(Number);
  return timeFormat.format(new Date(2000, 0, 1, hour, minute));
}

export const formatTimeRange = ({ startTime, endTime }) => `${formatTime(startTime)} – ${formatTime(endTime)}`;

/** "Mon, Wed · 9:00 AM – 10:00 AM", or a placeholder for a class whose time is not decided. */
export function formatSchedule(schedule, fallback = 'Schedule to be announced') {
  if (!schedule?.weekdays?.length) return fallback;
  const days = [...schedule.weekdays].sort((a, b) => a - b).map((day) => WEEKDAYS[day].short).join(', ');
  return `${days} · ${formatTimeRange(schedule)}`;
}

/** Keep in sync with server/src/utils/schedule.js. */
export function daysOutsideAvailability(schedule, availability = []) {
  return schedule.weekdays.filter((weekday) => !availability.some((slot) => slot.weekday === weekday
    && slot.startTime <= schedule.startTime
    && slot.endTime >= schedule.endTime));
}

export const sortSlots = (slots) => [...slots].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
