import { Classroom } from '../models/Classroom.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';

async function activeUsersWithRole(ids, role, label) {
  const uniqueIds = [...new Set(ids)];
  const users = await User.find({ _id: { $in: uniqueIds }, role, status: 'active' }).select('_id');
  if (users.length !== uniqueIds.length) {
    throw new AppError(400, `${label} must reference active ${role} accounts`);
  }
  return uniqueIds;
}

async function assignments(data) {
  const result = {};
  const teacherIds = data.teacherIds ?? (data.teacherId ? [data.teacherId] : undefined);
  if (teacherIds) {
    result.teachers = await activeUsersWithRole(teacherIds, 'teacher', 'Teachers');
    result.teacher = result.teachers[0];
  }
  if (data.studentIds) {
    result.students = await activeUsersWithRole(data.studentIds, 'student', 'Students');
  }
  return result;
}

export async function listClassrooms({ includeArchived = false } = {}, user) {
  const filter = includeArchived ? {} : { status: 'active' };
  if (user?.role === 'teacher') {
    filter.$or = [{ teacher: user._id }, { teachers: user._id }];
  }
  return Classroom.find(filter)
    .sort({ status: 1, name: 1 })
    .populate('teacher', 'firstName lastName email status')
    .populate('teachers', 'firstName lastName email status')
    .populate('students', 'firstName lastName email status');
}

export async function createClassroom(data, { actor, ipAddress }) {
  const assigned = await assignments(data);
  const classroom = await Classroom.create({ name: data.name, openAccess: data.openAccess, ...assigned });
  await logActivity({
    actorId: actor._id,
    action: 'classroom.created',
    entityType: 'Classroom',
    entityId: classroom._id,
    description: `${actor.fullName} created classroom "${classroom.name}"`,
    ipAddress,
  });
  return Classroom.findById(classroom._id)
    .populate('teacher', 'firstName lastName email status')
    .populate('teachers', 'firstName lastName email status')
    .populate('students', 'firstName lastName email status');
}

export async function updateClassroom(id, data, { actor, ipAddress }) {
  const classroom = await Classroom.findById(id);
  if (!classroom) throw new AppError(404, 'Classroom not found');
  if (classroom.status === 'archived') throw new AppError(409, 'Archived classrooms cannot be changed');
  const assigned = await assignments(data);
  if (data.name !== undefined) classroom.name = data.name;
  if (data.openAccess !== undefined) classroom.openAccess = data.openAccess;
  if (assigned.teachers) {
    classroom.teacher = assigned.teacher;
    classroom.teachers = assigned.teachers;
  }
  if (assigned.students) classroom.students = assigned.students;
  await classroom.save();
  await logActivity({
    actorId: actor._id,
    action: 'classroom.updated',
    entityType: 'Classroom',
    entityId: classroom._id,
    description: `${actor.fullName} updated classroom "${classroom.name}"`,
    ipAddress,
  });
  return classroom.populate([
    { path: 'teacher', select: 'firstName lastName email status' },
    { path: 'teachers', select: 'firstName lastName email status' },
    { path: 'students', select: 'firstName lastName email status' },
  ]);
}

export async function archiveClassroom(id, { actor, ipAddress }) {
  const classroom = await Classroom.findById(id);
  if (!classroom) throw new AppError(404, 'Classroom not found');
  if (classroom.status !== 'archived') {
    classroom.status = 'archived';
    await classroom.save();
    await logActivity({
      actorId: actor._id,
      action: 'classroom.archived',
      entityType: 'Classroom',
      entityId: classroom._id,
      description: `${actor.fullName} archived classroom "${classroom.name}"`,
      ipAddress,
    });
  }
  return classroom.populate([
    { path: 'teacher', select: 'firstName lastName email status' },
    { path: 'teachers', select: 'firstName lastName email status' },
    { path: 'students', select: 'firstName lastName email status' },
  ]);
}
