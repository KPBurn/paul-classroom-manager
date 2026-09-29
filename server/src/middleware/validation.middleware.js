import { AppError } from '../utils/AppError.js';

const toDetails = (issues) =>
  issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));

/**
 * Validates request parts against Zod schemas and replaces them with the parsed
 * (trimmed, coerced, unknown-keys-stripped) result. Express 5 exposes
 * `req.query` as a read-only getter, so parsed query data goes to
 * `req.validatedQuery` instead.
 */
export const validate =
  ({ params, body, query }) =>
  (req, _res, next) => {
    const parts = [
      ['params', params],
      ['query', query],
      ['body', body],
    ];

    for (const [part, schema] of parts) {
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        throw new AppError(400, 'Validation failed', {
          error: 'One or more fields are invalid',
          details: toDetails(result.error.issues),
        });
      }

      if (part === 'query') {
        req.validatedQuery = result.data;
      } else {
        req[part] = result.data;
      }
    }

    next();
  };
