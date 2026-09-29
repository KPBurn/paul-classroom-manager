import { Router } from 'express';
import { archive, create, list, update } from '../controllers/classroom.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  classroomIdParamsSchema,
  createClassroomSchema,
  listClassroomsQuerySchema,
  updateClassroomSchema,
} from '../validators/classroom.validators.js';

const router = Router();

router.use(authenticateUser);
router.get('/', requireRole('admin', 'teacher'), validate({ query: listClassroomsQuerySchema }), list);
router.use(requireRole('admin'));
router.post('/', validate({ body: createClassroomSchema }), create);
router.patch('/:id', validate({ params: classroomIdParamsSchema, body: updateClassroomSchema }), update);
router.post('/:id/archive', validate({ params: classroomIdParamsSchema }), archive);

export default router;
