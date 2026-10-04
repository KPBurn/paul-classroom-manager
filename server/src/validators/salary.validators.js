import { z } from 'zod';
import { WITHDRAWAL_METHODS, WITHDRAWAL_STATUSES } from '../models/SalaryWithdrawal.js';
import { SALARY_GRANULARITIES } from '../utils/salary.js';
import { isValidTimezone } from '../utils/timezone.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
const instant = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const timezone = z.string().min(1).max(100).refine(isValidTimezone, 'Unknown timezone');

const period = {
  from: instant.optional(),
  to: instant.optional(),
};

const orderedPeriod = (query) => !query.from || !query.to || query.to > query.from;

export const salarySummaryQuerySchema = z.object({
  teacherId: objectId.optional(),
  timezone: timezone.optional(),
  granularity: z.enum(SALARY_GRANULARITIES).optional(),
  ...period,
}).refine(orderedPeriod, {
  path: ['to'],
  message: 'The end of the period must be after its start',
});

export const teacherSalariesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().max(100).optional()),
  timezone: timezone.optional(),
  ...period,
}).refine(orderedPeriod, {
  path: ['to'],
  message: 'The end of the period must be after its start',
});

export const listWithdrawalsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  teacherId: objectId.optional(),
  status: z.preprocess((value) => (value === '' ? undefined : value), z.enum(WITHDRAWAL_STATUSES).optional()),
});

export const withdrawalParamsSchema = z.object({ id: objectId });

export const createWithdrawalSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  method: z.enum(WITHDRAWAL_METHODS).optional(),
  note: z.string().trim().max(200).optional(),
}).strict();

export const reviewWithdrawalSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNote: z.string().trim().max(200).optional(),
}).strict();