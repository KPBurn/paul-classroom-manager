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

export const listAnnouncementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
