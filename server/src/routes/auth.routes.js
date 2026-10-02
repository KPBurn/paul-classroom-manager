import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import {
  changePassword,
  login,
  loginWithTestRole,
  logout,
  me,
  register,
  roleTestingStatus,
} from '../controllers/auth.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { loginLimiter } from '../middleware/rateLimit.middleware.js';
import { requirePermission } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { changePasswordSchema, loginSchema, registerSchema, roleTestLoginSchema } from '../validators/auth.validators.js';

const router = Router();

router.post('/login', loginLimiter, validate({ body: loginSchema }), login);
router.get('/test-login/status', roleTestingStatus);
router.post('/test-login', loginLimiter, validate({ body: roleTestLoginSchema }), loginWithTestRole);

// Accounts are provisioned by administrators — there is no public sign-up.
router.post(
  '/register',
  authenticateUser,
  requirePermission(PERMISSIONS.USERS_CREATE),
  validate({ body: registerSchema }),
  register,
);

router.get('/me', authenticateUser, me);
// Limited like sign-in, so a stolen session cannot be used to guess the current password.
router.put('/password', loginLimiter, authenticateUser, validate({ body: changePasswordSchema }), changePassword);
router.post('/logout', authenticateUser, logout);

export default router;
