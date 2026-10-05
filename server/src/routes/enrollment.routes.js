import express, { Router } from 'express';
import {
  classes,
  createAccount,
  decide,
  decideApplication,
  list,
  ownRequests,
  photo,
  requestClasses,
  show,
  status,
  submit,
  uploadPhoto,
} from '../controllers/enrollment.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { enrollmentLimiter, verificationLimiter } from '../middleware/rateLimit.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  applicationIdParamsSchema,
  checkStatusSchema,
  classRequestParamsSchema,
  createAccountSchema,
  decideApplicationSchema,
  decideRequestSchema,
  listApplicationsQuerySchema,
  referenceParamsSchema,
  requestClassesSchema,
  submitApplicationSchema,
} from '../validators/enrollment.validators.js';

const router = Router();

// Applying needs no account: the applicant gets one only after an administrator approves them.
router.get('/classes', classes);
router.post('/applications', enrollmentLimiter, validate({ body: submitApplicationSchema }), submit);
router.post(
  '/applications/:referenceNumber/photo',
  enrollmentLimiter,
  validate({ params: referenceParamsSchema }),
  express.raw({ type: 'application/octet-stream', limit: '2mb' }),
  uploadPhoto,
);
router.post('/status', verificationLimiter, validate({ body: checkStatusSchema }), status);
router.post('/account', verificationLimiter, validate({ body: createAccountSchema }), createAccount);

router.use(authenticateUser);
// A student who already has an account asks for another class without filling in the form again.
router.get('/requests', requireRole('student'), ownRequests);
router.post('/requests', requireRole('student'), validate({ body: requestClassesSchema }), requestClasses);

router.use(requireRole('admin'));
router.get('/applications', validate({ query: listApplicationsQuerySchema }), list);
router.get('/applications/:id', validate({ params: applicationIdParamsSchema }), show);
router.get('/applications/:id/photo', validate({ params: applicationIdParamsSchema }), photo);
router.patch(
  '/applications/:id',
  validate({ params: applicationIdParamsSchema, body: decideApplicationSchema }),
  decideApplication,
);
router.patch(
  '/applications/:id/requests/:requestId',
  validate({ params: classRequestParamsSchema, body: decideRequestSchema }),
  decide,
);

export default router;
