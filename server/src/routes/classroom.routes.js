import { Router } from 'express';
import {
  archive,
  create,
  createAnnouncement,
  list,
  listAnnouncements,
  show,
  update,
} from '../controllers/classroom.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { createAnnouncementSchema, listAnnouncementsQuerySchema } from '../validators/announcement.validators.js';
import {
  classroomIdParamsSchema,
  createClassroomSchema,
  listClassroomsQuerySchema,
  updateClassroomSchema,
} from '../validators/classroom.validators.js';

const router = Router();

router.use(authenticateUser);
// Students only see classrooms they are enrolled in; the service scopes every read.
router.get('/', requireRole('admin', 'teacher', 'student'), validate({ query: listClassroomsQuerySchema }), list);
router.get('/:id', requireRole('admin', 'teacher', 'student'), validate({ params: classroomIdParamsSchema }), show);
router.get(
  '/:id/announcements',
  requireRole('admin', 'teacher', 'student'),
  validate({ params: classroomIdParamsSchema, query: listAnnouncementsQuerySchema }),
  listAnnouncements,
);
router.post(
  '/:id/announcements',
  requireRole('admin', 'teacher'),
  validate({ params: classroomIdParamsSchema, body: createAnnouncementSchema }),
  createAnnouncement,
);
router.use(requireRole('admin'));
router.post('/', validate({ body: createClassroomSchema }), create);
router.patch('/:id', validate({ params: classroomIdParamsSchema, body: updateClassroomSchema }), update);
router.post('/:id/archive', validate({ params: classroomIdParamsSchema }), archive);

export default router;
