import { Router } from 'express';
import { create, lessonRoster, list, pending, show, update } from '../controllers/feedback.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  createFeedbackSchema,
  feedbackIdParamsSchema,
  lessonParamsSchema,
  listFeedbackQuerySchema,
  updateFeedbackSchema,
} from '../validators/feedback.validators.js';

const router = Router();

// Teachers write feedback; admins can read it. Students have no access.
router.use(authenticateUser, requireRole('admin', 'teacher'));
router.get('/', validate({ query: listFeedbackQuerySchema }), list);
router.get('/pending', requireRole('teacher'), pending);
router.get('/lessons/:sessionId', validate({ params: lessonParamsSchema }), lessonRoster);
router.get('/:id', validate({ params: feedbackIdParamsSchema }), show);
router.post('/', requireRole('teacher'), validate({ body: createFeedbackSchema }), create);
router.patch('/:id', requireRole('teacher'), validate({ params: feedbackIdParamsSchema, body: updateFeedbackSchema }), update);

export default router;
