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
