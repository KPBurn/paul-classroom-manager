import { z } from 'zod';
import { classScheduleSchema } from './schedule.validators.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
const name = z.string().trim().min(1).max(120);
const subject = z.string().trim().max(80);
// `null` clears the schedule ("to be announced").
const schedule = classScheduleSchema.nullable();

export const createClassroomSchema = z.object({
  name,
  subject: subject.default(''),
  schedule: schedule.default(null),
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
  teacherId: objectId.optional(),
  teacherIds: z.array(objectId).min(1).max(100).optional(),
  studentIds: z.array(objectId).max(500).optional(),
  openAccess: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export const classroomIdParamsSchema = z.object({ id: objectId });

export const listClassroomsQuerySchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
}).strict();
