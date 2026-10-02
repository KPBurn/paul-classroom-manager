import { User } from '../models/User.js';
import { logActivity } from '../utils/activityLogger.js';
import { AppError } from '../utils/AppError.js';
import { assertDeletable, leaveClassrooms } from './userLinks.service.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every word must match a name or the email, so "jane cruz" finds Jane Cruz. */
function searchFilter(search) {
  if (!search) return {};
  return {
    $and: search.split(/\s+/).map((word) => {
      const pattern = new RegExp(escapeRegex(word), 'i');
      return { $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }] };
    }),
  };
}

async function findUserOrThrow(id) {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return user;
}

async function assertEmailAvailable(email, message) {
  if (await User.exists({ email })) {
    throw new AppError(409, message, { error: 'Email already exists' });
  }
}

export async function listUsers({ page, limit, search, role, status }) {
  const filter = { ...searchFilter(search), ...(role && { role }), ...(status && { status }) };

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ lastName: 1, firstName: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export const getUser = (id) => findUserOrThrow(id);

export async function createUser(data, { actor, ipAddress } = {}) {
  await assertEmailAvailable(data.email, 'Unable to create user');

  const user = await User.create(data);
  await logActivity({
    actorId: actor?._id,
    action: 'user.created',
    entityType: 'User',
    entityId: user._id,
    description: `Created ${user.role} account for ${user.fullName}`,
    ipAddress,
  });

  return user;
}

export async function updateUser(id, changes, { actor, ipAddress }) {
  const user = await findUserOrThrow(id);

  // Stops an administrator from locking themselves (and possibly everyone) out.
  if (user._id.equals(actor._id)) {
    if (changes.role && changes.role !== user.role) {
      throw new AppError(403, 'You cannot change your own role');
    }
    if (changes.status && changes.status !== user.status) {
      throw new AppError(403, 'You cannot change your own status');
    }
  }
  if (changes.email && changes.email !== user.email) {
    await assertEmailAvailable(changes.email, 'Unable to update user');
  }

  // A teacher who becomes a student (or the reverse) no longer belongs in the classrooms
  // their old role put them in. This runs before the role changes, while it still says which.
  const leftClassrooms = changes.role && changes.role !== user.role ? await leaveClassrooms(user) : [];

  user.set(changes);
  const changedFields = user.modifiedPaths();
  if (changedFields.length === 0) {
    return user;
  }

  await user.save();
  await logActivity({
    actorId: actor._id,
    action: 'user.updated',
    entityType: 'User',
    entityId: user._id,
    description: `Updated ${user.fullName} (${changedFields.join(', ')})${
      leftClassrooms.length ? `; removed from ${leftClassrooms.length} classroom(s)` : ''
    }`,
    ipAddress,
  });

  return user;
}

/** Sets a new password and signs the user out of every existing session. */
export async function resetPassword(id, { password }, { actor, ipAddress }) {
  const user = await findUserOrThrow(id);

  user.password = password;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  await logActivity({
    actorId: actor._id,
    action: 'user.password_reset',
    entityType: 'User',
    entityId: user._id,
    description: `Reset the password of ${user.fullName}`,
    ipAddress,
  });

  return user;
}

export async function deleteUser(id, { actor, ipAddress }) {
  const user = await findUserOrThrow(id);

  if (user._id.equals(actor._id)) {
    throw new AppError(403, 'You cannot delete your own account');
  }
  await assertDeletable(user);

  await user.deleteOne();
  await logActivity({
    actorId: actor._id,
    action: 'user.deleted',
    entityType: 'User',
    entityId: user._id,
    description: `Deleted ${user.role} account of ${user.fullName} (${user.email})`,
    ipAddress,
  });
}
