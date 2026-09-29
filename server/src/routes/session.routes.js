import { Router } from 'express';
import {
  attendance,
  cancel,
  checkIn,
  correctAttendance,
  create,
  list,
  messages,
  update,
} from '../controllers/session.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  attendanceParamsSchema,
  cancelSessionSchema,
  correctAttendanceSchema,
  createSessionSchema,
  listSessionsQuerySchema,
  sessionIdParamsSchema,
  sessionUpdateSchema,
} from '../validators/session.validators.js';

const router = Router();

router.use(authenticateUser);
router.get('/', requireRole('teacher', 'student'), validate({ query: listSessionsQuerySchema }), list);
router.post('/', requireRole('teacher'), validate({ body: createSessionSchema }), create);
router.get('/:id/messages', requireRole('teacher', 'student'), validate({ params: sessionIdParamsSchema }), messages);
router.post('/:id/check-in', requireRole('student'), validate({ params: sessionIdParamsSchema }), checkIn);
router.get('/:id/attendance', requireRole('teacher'), validate({ params: sessionIdParamsSchema }), attendance);
router.patch(
  '/:id/attendance/:studentId',
  requireRole('teacher'),
  validate({ params: attendanceParamsSchema, body: correctAttendanceSchema }),
  correctAttendance,
);
router.patch('/:id', requireRole('teacher'), validate({ params: sessionIdParamsSchema, body: sessionUpdateSchema }), update);
router.post('/:id/cancel', requireRole('teacher'), validate({ params: sessionIdParamsSchema, body: cancelSessionSchema }), cancel);

export default router;
