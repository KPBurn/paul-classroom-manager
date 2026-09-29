import { permissionsFor } from '../config/permissions.js';
import { User } from '../models/User.js';
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
  };
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
