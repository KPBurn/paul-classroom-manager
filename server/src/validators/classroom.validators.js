import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
const name = z.string().trim().min(1).max(120);

export const createClassroomSchema = z.object({
  name,
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
  teacherId: objectId.optional(),
  teacherIds: z.array(objectId).min(1).max(100).optional(),
  studentIds: z.array(objectId).max(500).optional(),
  openAccess: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export const classroomIdParamsSchema = z.object({ id: objectId });

export const listClassroomsQuerySchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
}).strict();
