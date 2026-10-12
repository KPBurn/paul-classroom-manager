import express, { Router } from 'express';
import { z } from 'zod';
import {
  attendance,
  cancel,
  correctAttendance,
  create,
  list,
  messages,
  openZoom,
  room,
  setMeetingProvider,
  startNow,
  downloadFile,
  listFiles,
  uploadFile,
  update,
  zoomLink,
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
  meetingProviderSchema,
  sessionIdParamsSchema,
  sessionUpdateSchema,
  startSessionSchema,
} from '../validators/session.validators.js';

const router = Router();
const sessionFileParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i),
  fileId: z.string().regex(/^[a-f\d]{24}$/i),
});

router.use(authenticateUser);
router.get('/', requireRole('admin', 'teacher', 'student'), validate({ query: listSessionsQuerySchema }), list);
router.post('/', requireRole('admin', 'teacher'), validate({ body: createSessionSchema }), create);
router.post('/start', requireRole('admin', 'teacher'), validate({ body: startSessionSchema }), startNow);
router.get('/:id/room',validate({ params: sessionIdParamsSchema }), room);
// Where the class is held, chosen by its teachers: its class room or Zoom.
router.put(
  '/:id/meeting-provider',
  requireRole('admin', 'teacher'),
  validate({ params: sessionIdParamsSchema, body: meetingProviderSchema }),
  setMeetingProvider,
);
// A class held in Zoom: teachers open the meeting, everyone allowed in gets its link.
router.post('/:id/zoom', requireRole('admin', 'teacher'), validate({ params: sessionIdParamsSchema }), openZoom);
router.get('/:id/zoom', validate({ params: sessionIdParamsSchema }), zoomLink);
router.get('/:id/files', validate({ params: sessionIdParamsSchema }), listFiles);
router.post(
  '/:id/files',
  validate({ params: sessionIdParamsSchema }),
  express.raw({ type: 'application/octet-stream', limit: '8mb' }),
  uploadFile,
);
router.get('/:id/files/:fileId', validate({ params: sessionFileParamsSchema }), downloadFile);
router.get('/:id/messages', validate({ params: sessionIdParamsSchema }), messages);
router.get('/:id/attendance', requireRole('admin', 'teacher'), validate({ params: sessionIdParamsSchema }), attendance);
router.patch(
  '/:id/attendance/:studentId',
  requireRole('admin', 'teacher'),
  validate({ params: attendanceParamsSchema, body: correctAttendanceSchema }),
  correctAttendance,
);
router.patch('/:id', requireRole('admin', 'teacher'), validate({ params: sessionIdParamsSchema, body: sessionUpdateSchema }), update);
router.post('/:id/cancel', requireRole('admin', 'teacher'), validate({ params: sessionIdParamsSchema, body: cancelSessionSchema }), cancel);

export default router;
