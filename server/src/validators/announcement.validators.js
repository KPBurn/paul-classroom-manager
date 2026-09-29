import { z } from 'zod';
import { ANNOUNCEMENT_LIMITS } from '../models/Announcement.js';

const text = (label, max) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

export const createAnnouncementSchema = z.object({
  title: text('Title', ANNOUNCEMENT_LIMITS.title),
  body: text('Body', ANNOUNCEMENT_LIMITS.body),
  type: text('Type', ANNOUNCEMENT_LIMITS.type),
});

export const updateAnnouncementSchema = createAnnouncementSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export const listAnnouncementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'archived']).default('active'),
});

export const announcementIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid announcement'),
});
