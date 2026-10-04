import { Router } from 'express';
import {
  cancelWithdrawal,
  requestWithdrawal,
  reviewWithdrawal,
  summary,
  teachers,
  withdrawals,
} from '../controllers/salary.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  createWithdrawalSchema,
  listWithdrawalsQuerySchema,
  reviewWithdrawalSchema,
  salarySummaryQuerySchema,
  teacherSalariesQuerySchema,
  withdrawalParamsSchema,
} from '../validators/salary.validators.js';

const router = Router();

router.use(authenticateUser, requireRole('admin', 'teacher'));

router.get('/summary', validate({ query: salarySummaryQuerySchema }), summary);
router.get('/teachers', requireRole('admin'), validate({ query: teacherSalariesQuerySchema }), teachers);
router.get('/withdrawals', validate({ query: listWithdrawalsQuerySchema }), withdrawals);
router.post('/withdrawals', validate({ body: createWithdrawalSchema }), requestWithdrawal);
router.patch(
  '/withdrawals/:id',
  requireRole('admin'),
  validate({ params: withdrawalParamsSchema, body: reviewWithdrawalSchema }),
  reviewWithdrawal,
);
router.delete('/withdrawals/:id', validate({ params: withdrawalParamsSchema }), cancelWithdrawal);

export default router;