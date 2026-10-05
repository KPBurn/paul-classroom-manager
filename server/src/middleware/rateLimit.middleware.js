import { rateLimit } from 'express-rate-limit';
import { isTest } from '../config/environment.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const limitReached = (message) => (_req, res) => {
  res.status(429).json({ success: false, message, error: 'Too many requests' });
};

export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 500,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  handler: limitReached('Too many requests. Please slow down and try again shortly.'),
});

/** Keeps the public enrollment form from being used to flood the school with applications. */
export const enrollmentLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  handler: limitReached('Too many enrollment requests. Please wait 15 minutes and try again.'),
});

/** Requests that make the server send an email: every one counts, since each always answers the same way. */
export const emailLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  handler: limitReached('Too many requests. Please wait 15 minutes and try again.'),
});

/** Slows down guessing of a reference number and birthday, like the login limit does for passwords. */
export const verificationLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isTest,
  handler: limitReached('Too many attempts. Please wait 15 minutes and try again.'),
});

/** Stricter limit on login to slow down password guessing. */
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isTest,
  handler: limitReached('Too many login attempts. Please wait 15 minutes and try again.'),
});
