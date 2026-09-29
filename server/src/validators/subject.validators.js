import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(''),
  classroomId: objectId,
}).strict();

export const subjectIdParamsSchema = z.object({ id: objectId });

export const subjectMaterialParamsSchema = z.object({
  id: objectId,
  materialId: objectId,
});
