import { ActivityLog } from '../models/ActivityLog.js';

/**
 * Records an audit entry. Logging must never break the request that triggered
 * it, so failures are reported to the console and swallowed.
 */
export async function logActivity({ actorId, action, entityType, entityId, description, ipAddress }) {
  try {
    await ActivityLog.create({ actorId, action, entityType, entityId, description, ipAddress });
  } catch (err) {
    console.error(`Failed to record activity "${action}":`, err.message);
  }
}
