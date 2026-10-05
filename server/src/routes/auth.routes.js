import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../config/permissions.js';
import {
  changePassword,
  forgotPassword,
  login,
  loginWithTestRole,
  logout,
  me,
  register,
  resetPassword,
  roleTestingStatus,
  setAvailability,
} from '../controllers/auth.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { emailLimiter, loginLimiter, verificationLimiter } from '../middleware/rateLimit.middleware.js';
import { requirePermission, requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { availabilitySchema } from '../validators/schedule.validators.js';
import {
  changePasswordSchema,
  emailSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  roleTestLoginSchema,
} from '../validators/auth.validators.js';

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

router.post('/forgot-password', emailLimiter, validate({ body: z.object({ email: emailSchema }).strict() }), forgotPassword);
router.post(
  '/reset-password',
  verificationLimiter,
  validate({ body: z.object({ token: z.string().min(1).max(1000), password: passwordSchema }).strict() }),
  resetPassword,
);

router.get('/me', authenticateUser, me);
// Limited like sign-in, so a stolen session cannot be used to guess the current password.
router.put('/password', loginLimiter, authenticateUser, validate({ body: changePasswordSchema }), changePassword);
router.put(
  '/availability',
  authenticateUser,
  requireRole('teacher'),
  validate({ body: z.object({ availability: availabilitySchema }).strict() }),
  setAvailability,
);
router.post('/logout', authenticateUser, logout);

export default router;
