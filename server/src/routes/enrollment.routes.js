import express, { Router } from 'express';
import {
  classes,
  createAccount,
  decide,
  decideApplication,
  list,
  ownPhoto,
  ownRecord,
  ownRequests,
  photo,
  recordOf,
  remindReference,
  reopen,
  reopenApplication,
  requestClasses,
  show,
  status,
  submit,
  uploadPhoto,
  withdraw,
} from '../controllers/enrollment.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { emailLimiter, enrollmentLimiter, verificationLimiter } from '../middleware/rateLimit.middleware.js';
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
  remindReferenceSchema,
  requestClassesSchema,
  submitApplicationSchema,
  userIdParamsSchema,
} from '../validators/enrollment.validators.js';

const router = Router();
const student = requireRole('student');
const admin = requireRole('admin');
const byId = { params: applicationIdParamsSchema };
const byRequest = { params: classRequestParamsSchema };

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
router.post('/reference', emailLimiter, validate({ body: remindReferenceSchema }), remindReference);
router.post('/status', verificationLimiter, validate({ body: checkStatusSchema }), status);
router.post('/account', verificationLimiter, validate({ body: createAccountSchema }), createAccount);

router.use(authenticateUser);
// A student who has an account asks for their classes here, without filling in the form again.
router.get('/requests', student, ownRequests);
router.post('/requests', student, validate({ body: requestClassesSchema }), requestClasses);
router.delete('/requests/:id/:requestId', student, validate(byRequest), withdraw);
// What the student gave when they applied.
router.get('/record', student, ownRecord);
router.get('/record/photo', student, ownPhoto);

router.get('/users/:userId/record', admin, validate({ params: userIdParamsSchema }), recordOf);
router.get('/applications', admin, validate({ query: listApplicationsQuerySchema }), list);
router.get('/applications/:id', admin, validate(byId), show);
router.get('/applications/:id/photo', admin, validate(byId), photo);
router.patch('/applications/:id', admin, validate({ ...byId, body: decideApplicationSchema }), decideApplication);
router.post('/applications/:id/reopen', admin, validate(byId), reopenApplication);
router.patch('/applications/:id/requests/:requestId', admin, validate({ ...byRequest, body: decideRequestSchema }), decide);
router.post('/applications/:id/requests/:requestId/reopen', admin, validate(byRequest), reopen);

export default router;
