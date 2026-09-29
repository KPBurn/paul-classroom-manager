export const ROLES = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
};

export const ROLE_LABELS = {
  admin: 'Administrator',
  teacher: 'Teacher',
  student: 'Student',
};

export const STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
};

// Keep in sync with PERMISSIONS in server/src/config/permissions.js.
export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  ANNOUNCEMENTS_READ: 'announcements:read',
  ANNOUNCEMENTS_CREATE: 'announcements:create',
};

const DEFAULT_ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS),
  teacher: [PERMISSIONS.ANNOUNCEMENTS_READ],
  student: [],
};

/**
 * Prefer permissions from the API. Role defaults keep the UI compatible with
 * older API responses that do not include a permissions array.
 */
export const hasPermission = (user, permission) => {
  const permissions = user?.permissions ?? DEFAULT_ROLE_PERMISSIONS[user?.role] ?? [];
  return permissions.includes(permission);
};

export const homePathFor = (role) => {
  if (role === ROLES.ADMIN) return '/admin';
  if (role === ROLES.STUDENT) return '/student';
  return '/teacher';
};
