import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';

const ALGORITHM = 'HS256';

export function signToken(user) {
  return jwt.sign({ role: user.role, ver: user.tokenVersion ?? 0 }, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtExpiresIn,
    algorithm: ALGORITHM,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
}
