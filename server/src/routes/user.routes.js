import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { create, list, remove, resetPassword, show, update } from '../controllers/user.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdParamsSchema,
} from '../validators/user.validators.js';

const router = Router();
const byId = { params: userIdParamsSchema };

router.use(authenticateUser);

router.get('/', requirePermission(PERMISSIONS.USERS_READ), validate({ query: listUsersQuerySchema }), list);
router.post('/', requirePermission(PERMISSIONS.USERS_CREATE), validate({ body: createUserSchema }), create);
router.get('/:id', requirePermission(PERMISSIONS.USERS_READ), validate(byId), show);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.USERS_UPDATE),
  validate({ ...byId, body: updateUserSchema }),
  update,
);
router.put(
  '/:id/password',
  requirePermission(PERMISSIONS.USERS_UPDATE),
  validate({ ...byId, body: resetPasswordSchema }),
  resetPassword,
);
router.delete('/:id', requirePermission(PERMISSIONS.USERS_DELETE), validate(byId), remove);

export default router;
