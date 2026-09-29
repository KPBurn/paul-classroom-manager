import { z } from 'zod';
import { FEEDBACK_LIMITS } from '../models/TeacherFeedback.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
const text = (max) => z.string().trim().max(max, `Must be at most ${max} characters`);
const longText = text(FEEDBACK_LIMITS.longText);
const rating = z.number().int().min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars').nullable();

/** The feedback content a teacher writes. Drafts may leave any of it empty. */
const contentSchema = {
  book: text(FEEDBACK_LIMITS.book).optional(),
  whatWeLearned: longText.optional(),
  vocabulary: z.object({ newWords: longText.optional(), independentWords: longText.optional() }).strict().optional(),
  grammar: z.object({
    topic: text(FEEDBACK_LIMITS.shortText).optional(),
    understanding: longText.optional(),
    accuracy: longText.optional(),
  }).strict().optional(),
  speaking: z.object({
    fluency: rating.optional(),
    pronunciation: rating.optional(),
    confidence: rating.optional(),
  }).strict().optional(),
  didWell: longText.optional(),
  needsImprovement: longText.optional(),
  recommendation: longText.optional(),
  notes: longText.optional(),
  status: z.enum(['draft', 'completed']).default('draft'),
};

export const createFeedbackSchema = z.object({
  sessionId: objectId,
  studentId: objectId,
  ...contentSchema,
}).strict();

export const updateFeedbackSchema = z.object(contentSchema).strict();

export const feedbackIdParamsSchema = z.object({ id: objectId });
export const lessonParamsSchema = z.object({ sessionId: objectId });

export const listFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  classroomId: objectId.optional(),
  studentId: objectId.optional(),
  teacherId: objectId.optional(),
  status: z.enum(['draft', 'completed']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict();
