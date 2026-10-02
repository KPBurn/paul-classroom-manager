import { hasPermission, PERMISSIONS } from '../config/permissions.js';
import { Announcement } from '../models/Announcement.js';
import { Classroom } from '../models/Classroom.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import { canManageClassroom, canReadClassroom, teachesClassroom } from '../authz/policies.js';

async function findClassroom(id) {
  const classroom = await Classroom.findById(id);
  if (!classroom) throw new AppError(404, 'Classroom not found');
  return classroom;
}

const withDetails = (query) => query
  .populate('createdBy', 'firstName lastName')
  .populate('classroom', 'name');

async function paginate(filter, { page, limit }) {
  const [items, total] = await Promise.all([
    withDetails(Announcement.find(filter)
      .sort({ createdAt: -1, _id: -1 }) // _id breaks ties between same-millisecond inserts
      .skip((page - 1) * limit)
      .limit(limit)),
    Announcement.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

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

export async function createClassroomAnnouncement(classroomId, data, { actor, ipAddress }) {
  const classroom = await findClassroom(classroomId);
  if (!canManageClassroom(classroom, actor)) throw new AppError(403, 'You are not assigned to this classroom');
  if (classroom.status === 'archived') throw new AppError(409, 'Archived classrooms cannot receive announcements');

  const announcement = await Announcement.create({ ...data, classroom: classroom._id, createdBy: actor._id });

  await logActivity({
    actorId: actor._id,
    action: 'announcement.created',
    entityType: 'Announcement',
    entityId: announcement._id,
    description: `${actor.fullName} posted announcement "${announcement.title}" to ${classroom.name}`,
    ipAddress,
  });

  return withDetails(Announcement.findById(announcement._id));
}

/** School-wide announcements. Only people who can edit announcements may see archived ones. */
export async function listAnnouncements({ page, limit, status }, user) {
  if (status === 'archived' && !hasPermission(user.role, PERMISSIONS.ANNOUNCEMENTS_UPDATE)) {
    throw new AppError(403, 'You do not have permission to view archived announcements');
  }
  return paginate({ classroom: null, status }, { page, limit });
}

export async function listClassroomAnnouncements(classroomId, { page, limit, status }, user) {
  const classroom = await findClassroom(classroomId);
  if (!canReadClassroom(classroom, user)) throw new AppError(403, 'You are not assigned to this classroom');
  if (status === 'archived' && !canManageClassroom(classroom, user)) {
    throw new AppError(403, 'You do not have permission to view archived announcements');
  }
  return paginate({ classroom: classroom._id, status }, { page, limit });
}

/**
 * School-wide announcements need the matching announcement permission; classroom
 * announcements can also be managed by that classroom's teachers.
 */
async function manageableAnnouncement(id, user, permission) {
  const announcement = await Announcement.findById(id);
  if (!announcement) throw new AppError(404, 'Announcement not found');
  if (hasPermission(user.role, permission)) return announcement;
  if (announcement.classroom) {
    const classroom = await Classroom.findById(announcement.classroom).select('teacher teachers');
    if (classroom && teachesClassroom(classroom, user)) return announcement;
  }
  throw new AppError(403, 'You do not have permission to change this announcement');
}

export async function updateAnnouncement(id, changes, { actor, ipAddress }) {
  const announcement = await manageableAnnouncement(id, actor, PERMISSIONS.ANNOUNCEMENTS_UPDATE);
  Object.assign(announcement, changes);
  await announcement.save();

  await logActivity({
    actorId: actor._id,
    action: 'announcement.updated',
    entityType: 'Announcement',
    entityId: announcement._id,
    description: `${actor.fullName} updated announcement "${announcement.title}"`,
    ipAddress,
  });

  return withDetails(Announcement.findById(announcement._id));
}

export async function setAnnouncementStatus(id, status, { actor, ipAddress }) {
  const announcement = await manageableAnnouncement(id, actor, PERMISSIONS.ANNOUNCEMENTS_UPDATE);
  if (announcement.status !== status) {
    announcement.status = status;
    await announcement.save();
    await logActivity({
      actorId: actor._id,
      action: status === 'archived' ? 'announcement.archived' : 'announcement.restored',
      entityType: 'Announcement',
      entityId: announcement._id,
      description: `${actor.fullName} ${status === 'archived' ? 'archived' : 'restored'} announcement "${announcement.title}"`,
      ipAddress,
    });
  }

  return withDetails(Announcement.findById(announcement._id));
}

export async function deleteAnnouncement(id, { actor, ipAddress }) {
  const announcement = await manageableAnnouncement(id, actor, PERMISSIONS.ANNOUNCEMENTS_DELETE);
  await announcement.deleteOne();

  await logActivity({
    actorId: actor._id,
    action: 'announcement.deleted',
    entityType: 'Announcement',
    entityId: announcement._id,
    description: `${actor.fullName} deleted announcement "${announcement.title}"`,
    ipAddress,
  });
}
