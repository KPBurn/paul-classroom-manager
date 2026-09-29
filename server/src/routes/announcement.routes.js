import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { create, list } from '../controllers/announcement.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
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

export default router;
