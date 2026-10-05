import { z } from 'zod';

const weekday = z.number().int().min(0).max(6);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Enter a time as HH:mm');
const endsAfterStart = [
  (data) => data.endTime > data.startTime,
  { path: ['endTime'], message: 'End time must be after start time' },
];

/** The weekly times a teacher can teach. Several slots on one day are allowed. */
export const availabilitySchema = z.array(
  z.object({ weekday, startTime: time, endTime: time }).strict().refine(...endsAfterStart),
).max(42);

/** The weekly time of a class: the same hours on each of its days. */
export const classScheduleSchema = z.object({
  weekdays: z.array(weekday).min(1, 'Choose at least one day').max(7),
  startTime: time,
  endTime: time,
}).strict().refine(...endsAfterStart).refine((data) => data.weekdays.length === new Set(data.weekdays).size, {
  path: ['weekdays'],
  message: 'Weekdays must not contain duplicates',
});
