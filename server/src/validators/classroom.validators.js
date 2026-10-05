import { z } from 'zod';
import { classScheduleSchema } from './schedule.validators.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
const name = z.string().trim().min(1).max(120);
const subject = z.string().trim().max(80);
// `null` clears the schedule ("to be announced").
const schedule = classScheduleSchema.nullable();
// `null` means the class has no limit.
const capacity = z.number().int().min(1).max(1000).nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date');
// Books the class's sessions on its weekly schedule between two dates, like a recurring schedule on Schedules.
const sessions = z.object({
  startDate: date,
  endDate: date,
  timezone: z.string().min(1).max(100),
}).strict().refine((data) => data.endDate >= data.startDate, {
  path: ['endDate'],
  message: 'End date must be on or after start date',
});

export const createClassroomSchema = z.object({
  name,
  subject: subject.default(''),
  schedule: schedule.default(null),
  sessions: sessions.optional(),
  capacity: capacity.default(null),
  enrollmentOpen: z.boolean().default(true),
  teacherId: objectId.optional(),
  teacherIds: z.array(objectId).min(1).max(100).optional(),
  studentIds: z.array(objectId).max(500).default([]),
  openAccess: z.boolean().default(false),
}).strict().refine((data) => data.teacherIds?.length || data.teacherId, {
  message: 'Assign at least one teacher',
  path: ['teacherIds'],
});

export const updateClassroomSchema = z.object({
  name: name.optional(),
  subject: subject.optional(),
  schedule: schedule.optional(),
  sessions: sessions.optional(),
  capacity: capacity.optional(),
  enrollmentOpen: z.boolean().optional(),
  teacherId: objectId.optional(),
  teacherIds: z.array(objectId).min(1).max(100).optional(),
  studentIds: z.array(objectId).max(500).optional(),
  openAccess: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export const classroomIdParamsSchema = z.object({ id: objectId });

export const listClassroomsQuerySchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
}).strict();
