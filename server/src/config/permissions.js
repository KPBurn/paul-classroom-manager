/**
 * Role-based access control. Routes check permissions, never role names, so
 * changing what a role may do means editing this map only.
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
