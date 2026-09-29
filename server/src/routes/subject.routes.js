import express, { Router } from 'express';
import { list, create, get, uploadMaterial, downloadMaterial, deleteMaterial } from '../controllers/subject.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  createSubjectSchema,
  subjectIdParamsSchema,
  subjectMaterialParamsSchema,
} from '../validators/subject.validators.js';

const router = Router();

router.use(authenticateUser);
router.get('/', requireRole('teacher', 'student'), list);
router.post('/', requireRole('teacher'), validate({ body: createSubjectSchema }), create);
router.get('/:id', requireRole('teacher', 'student'), validate({ params: subjectIdParamsSchema }), get);
router.post(
  '/:id/materials',
  requireRole('teacher'),
  validate({ params: subjectIdParamsSchema }),
  express.raw({ type: 'application/octet-stream', limit: '8mb' }),
  uploadMaterial,
);
router.get(
  '/:id/materials/:materialId',
  requireRole('teacher', 'student'),
  validate({ params: subjectMaterialParamsSchema }),
  downloadMaterial,
);
router.delete(
  '/:id/materials/:materialId',
  requireRole('teacher'),
  validate({ params: subjectMaterialParamsSchema }),
  deleteMaterial,
);

export default router;
