import { z } from 'zod';
import { ENROLLMENT_STATUSES, GENDERS } from '../models/EnrollmentApplication.js';
import { emailSchema, nameSchema, passwordSchema } from './auth.validators.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
// An empty optional field (`""`) means it was left blank.
const blankable = (schema) => z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());
const optionalText = (max) => z.string().trim().max(max).default('');

const contactNumber = z.string().trim().regex(/^\+?[\d\s()-]{7,20}$/, 'Enter a valid contact number');
const referenceNumber = z.string().trim().toUpperCase().regex(/^ENR-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Enter the reference number as ENR-XXXX-XXXX');

const birthday = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid birthday').refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value >= '1900-01-01'
    && parsed.getTime() <= Date.now();
}, 'Enter a valid birthday');

const uniqueClassroomIds = z.array(objectId).max(10)
  .refine((ids) => ids.length === new Set(ids).size, 'Choose each class only once');
const classroomIds = uniqueClassroomIds.min(1, 'Choose at least one class');

export const submitApplicationSchema = z.object({
  student: z.object({
    firstName: nameSchema('First name'),
    middleName: optionalText(50),
    lastName: nameSchema('Last name'),
    email: emailSchema,
    birthday,
    gender: blankable(z.enum(GENDERS)),
    address: optionalText(300),
    contactNumber,
  }).strict(),
  guardian: z.object({
    name: z.string().trim().min(1, 'Guardian name is required').max(100),
    relationship: z.string().trim().min(1, 'Relationship is required').max(50),
    contactNumber,
    email: blankable(emailSchema),
  }).strict(),
  // Optional: an applicant can be approved first and choose their classes inside the portal.
  classroomIds: uniqueClassroomIds.default([]),
  note: optionalText(500),
  agreed: z.literal(true, 'You must agree before submitting'),
  // Checked by the service to keep scripts out: a field people never see, and the token the form was given.
  website: z.string().max(200).optional(),
  formToken: z.string().max(1000).optional(),
}).strict();

export const remindReferenceSchema = z.object({ email: emailSchema }).strict();
export const userIdParamsSchema = z.object({ userId: objectId });

export const referenceParamsSchema = z.object({ referenceNumber });

export const checkStatusSchema = z.object({ referenceNumber, birthday }).strict();

export const createAccountSchema = z.object({
  referenceNumber,
  birthday,
  email: emailSchema,
  password: passwordSchema,
}).strict();

export const requestClassesSchema = z.object({ classroomIds, note: optionalText(500) }).strict();

export const listApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: blankable(z.string().trim().max(100)),
  status: blankable(z.enum(ENROLLMENT_STATUSES)),
  classroomId: blankable(objectId),
});

export const applicationIdParamsSchema = z.object({ id: objectId });
export const classRequestParamsSchema = z.object({ id: objectId, requestId: objectId });

/** Deciding on an applicant who has not chosen a class yet. */
export const decideApplicationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  adminNote: z.string().trim().max(500).optional(),
}).strict();

export const decideRequestSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  // Approve into a different class than the one that was asked for.
  classroomId: objectId.optional(),
  adminNote: z.string().trim().max(500).optional(),
}).strict();
