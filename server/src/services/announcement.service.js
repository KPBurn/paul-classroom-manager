import { Announcement } from '../models/Announcement.js';
import { logActivity } from '../utils/activityLogger.js';

export async function createAnnouncement(data, { actor, ipAddress }) {
  const announcement = await Announcement.create({ ...data, createdBy: actor._id });

  await logActivity({
    actorId: actor._id,
    action: 'announcement.created',
    entityType: 'Announcement',
    entityId: announcement._id,
    description: `${actor.fullName} created announcement "${announcement.title}"`,
    ipAddress,
  });

  return announcement;
}

export async function listAnnouncements({ page, limit }) {
  const filter = { status: 'active' };

  const [items, total] = await Promise.all([
    Announcement.find(filter)
      .sort({ createdAt: -1, _id: -1 }) // _id breaks ties between same-millisecond inserts
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'firstName lastName'),
    Announcement.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
