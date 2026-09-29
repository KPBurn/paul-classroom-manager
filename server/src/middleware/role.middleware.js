import { hasPermission } from '../config/permissions.js';
import { AppError } from '../utils/AppError.js';

const FORBIDDEN = 'You do not have permission to perform this action';

/** Must run after `authenticateUser`. */
export const requireRole =
  (...allowedRoles) =>
  (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(403, FORBIDDEN);
    }
    next();
  };

/**
 * Allows the request only if the user's role grants every listed permission
 * (see config/permissions.js). Must run after `authenticateUser`.
 */
export const requirePermission =
  (...permissions) =>
  (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }
    if (!permissions.every((permission) => hasPermission(req.user.role, permission))) {
      throw new AppError(403, FORBIDDEN);
    }
    next();
  };
