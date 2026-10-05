import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';

const ALGORITHM = 'HS256';

export function signToken(user, { roleTestSession = false } = {}) {
  return jwt.sign(
    { role: user.role, ver: user.tokenVersion ?? 0, ...(roleTestSession ? { roleTestSession: true } : {}) },
    env.jwtSecret,
    {
      subject: user.id,
      expiresIn: env.jwtExpiresIn,
      algorithm: ALGORITHM,
    },
  );
}

/** Verifies a sign-in token. Tokens made for one action (see below) are refused here. */
export function verifyToken(token) {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
  if (payload.purpose) throw new Error('Not a sign-in token');
  return payload;
}

/**
 * A short-lived token for one action outside a signed-in session, such as
 * resetting a password. Its `purpose` stops it being used for anything else,
 * including signing in.
 */
export function signActionToken(purpose, subject, claims, expiresIn) {
  return jwt.sign({ purpose, ...claims }, env.jwtSecret, { subject, expiresIn, algorithm: ALGORITHM });
}

/** The token's claims, or `null` when it is not a valid, unexpired token for this purpose. */
export function verifyActionToken(purpose, token) {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
    return payload.purpose === purpose ? payload : null;
  } catch {
    return null;
  }
}
