/**
 * Weekly times, shared by teacher availability and class schedules. Days are
 * JavaScript day numbers (0 Sunday to 6 Saturday) and times are "HH:mm" on a
 * 24-hour clock, so two times compare correctly as text.
 */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The days of a class schedule that no availability slot of the teacher covers from start to end. */
export function daysOutsideAvailability(schedule, availability = []) {
  return schedule.weekdays.filter((weekday) => !availability.some((slot) => slot.weekday === weekday
    && slot.startTime <= schedule.startTime
    && slot.endTime >= schedule.endTime));
}
