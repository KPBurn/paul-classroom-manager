import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

export function notFound(req, _res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/** Converts known error types into client-safe AppErrors. */
function normalizeError(err) {
  if (err instanceof AppError) {
    return err;
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return new AppError(400, 'Validation failed', {
      error: 'One or more fields are invalid',
      details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(400, `Invalid value for ${err.path}`);
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'Value';
    return new AppError(409, 'Duplicate value', { error: `${field} already exists` });
  }
  // body-parser errors (malformed JSON, payload too large) are marked safe to expose.
  if (err?.expose && err.status < 500) {
    return new AppError(err.status, err.type === 'entity.parse.failed' ? 'Malformed JSON body' : err.message);
  }
  return null;
}

// Express recognizes error handlers by their four-argument signature.
export function errorHandler(err, req, res, _next) {
  const safeError = normalizeError(err);

  if (!safeError) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.',
    });
  }

  const { statusCode, message, error, details } = safeError;
  return res.status(statusCode).json({
    success: false,
    message,
    ...(error && { error }),
    ...(details && { details }),
  });
}
