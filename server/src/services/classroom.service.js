import { LIST_BATCH_SIZE } from '../config/database.js';
import { Classroom } from '../models/Classroom.js';
import { ClassSession } from '../models/ClassSession.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import { daysOutsideAvailability, WEEKDAY_NAMES } from '../utils/schedule.js';
import { canReadClassroom, classroomsTaughtBy } from '../authz/policies.js';
import { classroomPeopleChanged } from '../realtime/connections.js';
import { publishToClassroom, SESSION_EVENTS } from '../realtime/sessionEvents.js';

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

/** A class is scheduled inside the hours its teacher (the first one assigned) said they can teach. */
async function assertScheduleFits(schedule, teacherId) {
  if (!schedule) return;
  const teacher = await User.findById(teacherId).select('firstName lastName availability');
  const days = daysOutsideAvailability(schedule, teacher?.availability);
  if (days.length) {
    const message = `${teacher?.fullName ?? 'The teacher'} is not available on ${days.map((day) => WEEKDAY_NAMES[day]).join(', ')} from ${schedule.startTime} to ${schedule.endTime}. Choose a time inside the teacher’s availability.`;
    throw new AppError(400, message, { details: [{ field: 'schedule', message }] });
  }
}

/** Students see who teaches a class and how big it is, but not their classmates' details. */
function studentClassroomView(classroom) {
  const { students, ...view } = classroom.toJSON();
  return { ...view, studentCount: students.length };
}

export async function listClassrooms({ includeArchived = false } = {}, user) {
  if (user?.role === 'student') {
    const classrooms = await Classroom.find({ status: 'active', students: user._id })
      .sort({ name: 1 })
      .populate('teacher', 'firstName lastName')
      .populate('teachers', 'firstName lastName');
    return classrooms.map(studentClassroomView);
  }
  const filter = includeArchived ? {} : { status: 'active' };
  if (user?.role === 'teacher') {
    Object.assign(filter, classroomsTaughtBy(user));
  }
  return Classroom.find(filter)
    .sort({ status: 1, name: 1 })
    .populate('teacher', 'firstName lastName email status')
    .populate('teachers', 'firstName lastName email status')
    // Every roster in one answer: a school soon has more students than fit in a first batch.
    .populate({ path: 'students', select: 'firstName lastName email status', options: { batchSize: LIST_BATCH_SIZE } });
}

export async function getClassroom(id, user) {
  const classroom = await Classroom.findById(id);
  if (!classroom) throw new AppError(404, 'Classroom not found');
  if (!canReadClassroom(classroom, user)) throw new AppError(403, 'You are not assigned to this classroom');
  if (user.role === 'student') {
    await classroom.populate([
      { path: 'teacher', select: 'firstName lastName' },
      { path: 'teachers', select: 'firstName lastName' },
    ]);
    return studentClassroomView(classroom);
  }
  return classroom.populate([
    { path: 'teacher', select: 'firstName lastName email status' },
    { path: 'teachers', select: 'firstName lastName email status' },
    { path: 'students', select: 'firstName lastName email status' },
  ]);
}

export async function createClassroom(data, { actor, ipAddress }) {
  const assigned = await assignments(data);
  await assertScheduleFits(data.schedule, assigned.teacher);
  const classroom = await Classroom.create({
    name: data.name,
    subject: data.subject,
    schedule: data.schedule,
    openAccess: data.openAccess,
    ...assigned,
  });
  classroomPeopleChanged(classroom);
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
  if (data.subject !== undefined) classroom.subject = data.subject;
  if (data.schedule !== undefined) classroom.schedule = data.schedule;
  if (data.openAccess !== undefined) classroom.openAccess = data.openAccess;
  if (assigned.teachers) {
    classroom.teacher = assigned.teacher;
    classroom.teachers = assigned.teachers;
  }
  if (assigned.students) classroom.students = assigned.students;
  if (data.schedule !== undefined || assigned.teachers) await assertScheduleFits(classroom.schedule, classroom.teacher);
  await classroom.save();
  classroomPeopleChanged(classroom);
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

/**
 * Adds a student to active classrooms and to their sessions that have not
 * finished, which keep their own list of people. Used when an enrollment
 * request is approved.
 */
export async function enrollStudent(studentId, classroomIds) {
  const ids = await Classroom.find({ _id: { $in: classroomIds }, status: 'active' }).distinct('_id');
  await Classroom.updateMany({ _id: { $in: ids } }, { $addToSet: { students: studentId } });
  await ClassSession.updateMany(
    { classroom: { $in: ids }, status: 'scheduled', endsAt: { $gt: new Date() }, assignedStudents: { $exists: true } },
    { $addToSet: { assignedStudents: studentId } },
  );
  for (const classroom of await Classroom.find({ _id: { $in: ids } })) {
    classroomPeopleChanged(classroom);
    publishToClassroom(classroom._id, SESSION_EVENTS.scheduleChanged, { classroomId: String(classroom._id) });
  }
}
