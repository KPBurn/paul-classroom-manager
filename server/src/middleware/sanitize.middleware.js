const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isDangerousKey = (key) => key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key);

function stripDangerousKeys(value) {
  if (Array.isArray(value)) {
    return value.map(stripDangerousKeys);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isDangerousKey(key))
        .map(([key, nested]) => [key, stripDangerousKeys(nested)]),
    );
  }
  return value;
}

/**
 * Removes MongoDB operator keys (`$gt`, `$ne`, ...) and dotted paths from JSON
 * bodies to block NoSQL injection. Query strings are already safe: Express 5's
 * default "simple" parser never produces nested objects.
 */
export function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = stripDangerousKeys(req.body);
  }
  next();
}
