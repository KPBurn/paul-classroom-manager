import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
const title = z.string().trim().min(1).max(120);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const instant = z.string().datetime({ offset: true }).transform((value) => new Date(value));

const oneTime = z.object({
  classroomId: objectId,
  teacherIds: z.array(objectId).min(1).max(100).optional(),
  studentIds: z.array(objectId).max(500).optional(),
  title,
  startsAt: instant,
  endsAt: instant,
}).strict().refine((data) => data.endsAt > data.startsAt, {
  path: ['endsAt'],
  message: 'End time must be after start time',
}).refine((data) => !data.teacherIds || data.teacherIds.length === new Set(data.teacherIds).size, {
  path: ['teacherIds'],
  message: 'Teachers must not contain duplicates',
}).refine((data) => !data.studentIds || data.studentIds.length === new Set(data.studentIds).size, {
  path: ['studentIds'],
  message: 'Students must not contain duplicates',
});

const recurring = z.object({
  classroomId: objectId,
  teacherIds: z.array(objectId).min(1).max(100).optional(),
  studentIds: z.array(objectId).max(500).optional(),
  title,
  startDate: date,
  endDate: date,
  startTime: time,
  endTime: time,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  timezone: z.string().min(1).max(100),
}).strict().refine((data) => data.endDate >= data.startDate, {
  path: ['endDate'],
  message: 'End date must be on or after start date',
}).refine((data) => data.weekdays.length === new Set(data.weekdays).size, {
  path: ['weekdays'],
  message: 'Weekdays must not contain duplicates',
}).refine((data) => !data.teacherIds || data.teacherIds.length === new Set(data.teacherIds).size, {
  path: ['teacherIds'],
  message: 'Teachers must not contain duplicates',
}).refine((data) => !data.studentIds || data.studentIds.length === new Set(data.studentIds).size, {
  path: ['studentIds'],
  message: 'Students must not contain duplicates',
});

export const createSessionSchema = z.union([oneTime, recurring]);

export const listSessionsQuerySchema = z.object({
  view: z.enum(['mine']).optional(),
});

export const sessionAssignmentOptionsQuerySchema = z.object({
  classroomId: objectId,
}).strict();

export const sessionIdParamsSchema = z.object({ id: objectId });
export const attendanceParamsSchema = z.object({ id: objectId, studentId: objectId });
export const sessionMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
}).strict();

export const sessionUpdateSchema = z.object({
  scope: z.enum(['occurrence', 'series']),
  title: title.optional(),
  startsAt: instant.optional(),
  endsAt: instant.optional(),
  attendanceConditionEnabled: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).some((key) => key !== 'scope'), 'At least one field is required')
  .refine((data) => Boolean(data.startsAt) === Boolean(data.endsAt), {
    path: ['endsAt'],
    message: 'Start and end times must be supplied together',
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
    path: ['endsAt'],
    message: 'End time must be after start time',
  });

export const cancelSessionSchema = z.object({ scope: z.enum(['occurrence', 'series']) }).strict();

export const correctAttendanceSchema = z.object({
  status: z.enum(['present', 'late', 'absent']),
}).strict();
