/**
 * What each role may do with users and school-wide announcements. Other
 * routes gate on the role itself (`requireRole`).
 *
 * Whether an account is connected to a particular classroom or session (its
 * teacher, an enrolled student) is decided in authz/policies.js.
 */
export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  ANNOUNCEMENTS_READ: 'announcements:read',
  ANNOUNCEMENTS_CREATE: 'announcements:create',
  ANNOUNCEMENTS_UPDATE: 'announcements:update',
  ANNOUNCEMENTS_DELETE: 'announcements:delete',
};

export const ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS),
  teacher: [PERMISSIONS.ANNOUNCEMENTS_READ],
  student: [],
};

export const permissionsFor = (role) => ROLE_PERMISSIONS[role] ?? [];

export const hasPermission = (role, permission) => permissionsFor(role).includes(permission);
