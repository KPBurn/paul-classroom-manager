import { Router } from 'express';
import { show, update } from '../controllers/systemSettings.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { updateSystemSettingsSchema } from '../validators/systemSettings.validators.js';

const router = Router();

router.use(authenticateUser, requireRole('admin'));
router.get('/', show);
router.patch('/', validate({ body: updateSystemSettingsSchema }), update);

export default router;
