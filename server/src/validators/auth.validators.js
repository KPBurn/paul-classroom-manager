import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '../models/User.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export const nameSchema = (label) =>
  z.string().trim().min(1, `${label} is required`).max(50, `${label} must be at most 50 characters`);

// bcrypt only uses the first 72 bytes of a password, so longer ones are rejected.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export const registerSchema = z.object({
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(USER_ROLES).default('teacher'),
  status: z.enum(USER_STATUSES).default('active'),
});
