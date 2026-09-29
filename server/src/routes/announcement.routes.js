import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { archive, create, list, remove, restore, update } from '../controllers/announcement.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requirePermission, requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  announcementIdParamsSchema,
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
  updateAnnouncementSchema,
} from '../validators/announcement.validators.js';

const router = Router();

router.use(authenticateUser);

router.get(
  '/',
  requirePermission(PERMISSIONS.ANNOUNCEMENTS_READ),
  validate({ query: listAnnouncementsQuerySchema }),
  list,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.ANNOUNCEMENTS_CREATE),
  validate({ body: createAnnouncementSchema }),
  create,
);

// Teachers may change announcements in their own classrooms; the service checks ownership.
router.use('/:id', requireRole('admin', 'teacher'));
router.patch('/:id', validate({ params: announcementIdParamsSchema, body: updateAnnouncementSchema }), update);
router.post('/:id/archive', validate({ params: announcementIdParamsSchema }), archive);
router.post('/:id/restore', validate({ params: announcementIdParamsSchema }), restore);
router.delete('/:id', validate({ params: announcementIdParamsSchema }), remove);

export default router;
