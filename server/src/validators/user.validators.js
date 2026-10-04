import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '../models/User.js';
import { emailSchema, nameSchema, passwordSchema, registerSchema } from './auth.validators.js';

// An empty filter in the query string (`?role=`) means "no filter".
const optionalFilter = (schema) => z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const userIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id'),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalFilter(z.string().trim().max(100, 'Search must be at most 100 characters')),
  role: optionalFilter(z.enum(USER_ROLES)),
  status: optionalFilter(z.enum(USER_STATUSES)),
});

export const createUserSchema = registerSchema;

export const updateUserSchema = z
  .object({
    firstName: nameSchema('First name'),
    lastName: nameSchema('Last name'),
    email: emailSchema,
    role: z.enum(USER_ROLES),
    status: z.enum(USER_STATUSES),
    // What a teacher is paid for a class; only administrators assign it.
    sessionRate: z.number().min(0).max(1_000_000).nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});
