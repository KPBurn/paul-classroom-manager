import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
const name = z.string().trim().min(1).max(120);

export const createClassroomSchema = z.object({
  name,
  teacherId: objectId,
  studentIds: z.array(objectId).max(500).default([]),
  openAccess: z.boolean().default(false),
}).strict();

export const updateClassroomSchema = z.object({
  name: name.optional(),
  teacherId: objectId.optional(),
  studentIds: z.array(objectId).max(500).optional(),
  openAccess: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export const classroomIdParamsSchema = z.object({ id: objectId });

export const listClassroomsQuerySchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
}).strict();
