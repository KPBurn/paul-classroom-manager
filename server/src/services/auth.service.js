import { permissionsFor } from '../config/permissions.js';
import { User } from '../models/User.js';
import { disconnectUser } from '../realtime/connections.js';
import { SystemSettings } from '../models/SystemSettings.js';
import { logActivity } from '../utils/activityLogger.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { createUser } from './user.service.js';

const INVALID_CREDENTIALS = 'Invalid email or password';

// Comparing against a real hash when the email is unknown keeps response times
// similar, so attackers cannot use timing to discover which emails exist.
let dummyHashPromise;
const getDummyHash = () => (dummyHashPromise ??= hashPassword('timing-equalizer-password'));

export function toAuthUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    permissions: permissionsFor(user.role),
    ...(user.role === 'teacher' && { availability: user.availability ?? [] }),
  };
}

/** Lets a teacher say which weekly times they can teach; class schedules are chosen from them. */
export async function setOwnAvailability(user, availability, { ipAddress } = {}) {
  user.availability = availability;
  await user.save();
  await logActivity({
    actorId: user._id,
    action: 'user.availability_updated',
    entityType: 'User',
    entityId: user._id,
    description: `${user.fullName} updated their teaching availability`,
    ipAddress,
  });
  return toAuthUser(user);
}

export async function login({ email, password }, { ipAddress } = {}) {
  const user = await User.findOne({ email }).select('+password');
  const passwordMatches = await comparePassword(password, user?.password ?? (await getDummyHash()));

  if (!user || !passwordMatches) {
    throw new AppError(401, INVALID_CREDENTIALS);
  }
  if (user.status !== 'active') {
    throw new AppError(403, 'Your account is not active. Please contact an administrator.');
  }
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  await logActivity({
    actorId: user._id,
    action: 'auth.login',
    entityType: 'User',
    entityId: user._id,
    description: `${user.fullName} signed in`,
    ipAddress,
  });

  return { user: toAuthUser(user), token: signToken(user) };
}

export async function getRoleTestingStatus() {
  const settings = await SystemSettings.findById('system').select('roleTestingEnabled').lean();
  return { roleTestingEnabled: settings?.roleTestingEnabled ?? false };
}

export async function loginWithTestRole(role, { ipAddress } = {}) {
  const { roleTestingEnabled } = await getRoleTestingStatus();
  if (!roleTestingEnabled) {
    throw new AppError(403, 'Temporary role testing is disabled.');
  }

  const user = await User.findOne({ role, status: 'active' }).sort({ createdAt: 1 });
  if (!user) {
    throw new AppError(404, `No active ${role} account is available for testing.`);
  }
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  await logActivity({
    actorId: user._id,
    action: 'auth.role-test-login',
    entityType: 'User',
    entityId: user._id,
    description: `${user.fullName} signed in through temporary ${role} role testing`,
    ipAddress,
  });

  return { user: toAuthUser(user), token: signToken(user, { roleTestSession: true }) };
}

/**
 * Lets someone replace their own password. Every other place they are signed
 * in is signed out; this session carries on with the new token that is returned.
 */
export async function changeOwnPassword(userId, { currentPassword, newPassword }, { roleTestSession, ipAddress } = {}) {
  // Role testing borrows a real account; a tester must not be able to lock its owner out.
  if (roleTestSession) {
    throw new AppError(403, 'Passwords cannot be changed during temporary role testing.');
  }
  const user = await User.findById(userId).select('+password');
  if (!user || !(await comparePassword(currentPassword, user.password))) {
    throw new AppError(400, 'Your current password is not correct', {
      details: [{ field: 'currentPassword', message: 'Your current password is not correct' }],
    });
  }

  user.password = newPassword;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  await logActivity({
    actorId: user._id,
    action: 'user.password_changed',
    entityType: 'User',
    entityId: user._id,
    description: `${user.fullName} changed their password`,
    ipAddress,
  });
  await disconnectUser(user._id, 'Your password was changed. Sign in again with the new password.');

  return { user: toAuthUser(user), token: signToken(user) };
}

export async function register(data, context) {
  return toAuthUser(await createUser(data, context));
}

export async function logout(user, { ipAddress } = {}) {
  await logActivity({
    actorId: user._id,
    action: 'auth.logout',
    entityType: 'User',
    entityId: user._id,
    description: `${user.fullName} signed out`,
    ipAddress,
  });
}
