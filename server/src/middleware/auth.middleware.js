import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { SystemSettings } from '../models/SystemSettings.js';
import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/jwt.js';

function readBearerToken(req) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Verifies the JWT and loads the user from the database on every request, so a
 * role change or deactivation takes effect immediately instead of when the
 * token expires. A password reset bumps `tokenVersion`, which revokes older
 * tokens. The loaded user is available as `req.user`.
 */
export async function authenticateUser(req, _res, next) {
  const token = readBearerToken(req);
  if (!token) {
    throw new AppError(401, 'Authentication required');
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError(401, 'Your session is invalid or has expired. Please sign in again.');
  }

  const user = mongoose.isValidObjectId(payload.sub) ? await User.findById(payload.sub) : null;
  if (!user || user.status !== 'active') {
    throw new AppError(401, 'Your account is not active. Please sign in again.');
  }
  // Tokens issued before a password reset carry an older version.
  if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
    throw new AppError(401, 'Your session is invalid or has expired. Please sign in again.');
  }
  if (payload.roleTestSession) {
    const settings = await SystemSettings.findById('system').select('roleTestingEnabled').lean();
    if (!settings?.roleTestingEnabled) {
      throw new AppError(401, 'Temporary role testing has been disabled. Please sign in with your account.');
    }
  }

  req.user = user;
  // Signed in through temporary role testing rather than with the account's own password.
  req.roleTestSession = Boolean(payload.roleTestSession);
  next();
}
