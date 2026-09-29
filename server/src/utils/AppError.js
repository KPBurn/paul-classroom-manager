/**
 * An error that is safe to show to the client. Anything else that reaches the
 * error handler is treated as an internal error and its message is hidden.
 */
export class AppError extends Error {
  constructor(statusCode, message, { error, details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.error = error;
    this.details = details;
  }
}
