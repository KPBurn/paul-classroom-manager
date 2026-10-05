import { LIST_BATCH_SIZE } from '../config/database.js';
import { Classroom } from '../models/Classroom.js';
import { ClassSession } from '../models/ClassSession.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import { daysOutsideAvailability, WEEKDAY_NAMES } from '../utils/schedule.js';
import { canReadClassroom, classroomsTaughtBy } from '../authz/policies.js';
import { classroomPeopleChanged } from '../realtime/connections.js';
import { DATA_RESOURCES, publishDataChanged } from '../realtime/dataEvents.js';
import { publishToClassroom, SESSION_EVENTS } from '../realtime/sessionEvents.js';
import { createSessions } from './session.service.js';

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
async function assertScheduleFits(schedule, teacherId, exceptClassroomId) {
  if (!schedule) return;
  const teacher = await User.findById(teacherId).select('firstName lastName availability');
  const days = daysOutsideAvailability(schedule, teacher?.availability);
  if (days.length) {
    const message = `${teacher?.fullName ?? 'The teacher'} is not available on ${days.map((day) => WEEKDAY_NAMES[day]).join(', ')} from ${schedule.startTime} to ${schedule.endTime}. Choose a time inside the teacher’s availability.`;
    throw new AppError(400, message, { details: [{ field: 'schedule', message }] });
  }
  if (teacher) await assertTeacherFree(schedule, teacher, exceptClassroomId);
}

const timesOverlap = (a, b) => a.startTime < b.endTime && b.startTime < a.endTime
  && a.weekdays.some((day) => b.weekdays.includes(day));

/** A teacher cannot be in two classes at once: no other active class of theirs may share a day and time. */
async function assertTeacherFree(schedule, teacher, exceptClassroomId) {
  const others = await Classroom.find({
    status: 'active',
    schedule: { $ne: null },
    ...classroomsTaughtBy(teacher),
    ...(exceptClassroomId && { _id: { $ne: exceptClassroomId } }),
  }).select('name schedule');
  const clash = others.find((other) => timesOverlap(schedule, other.schedule));
  if (clash) {
    const days = schedule.weekdays.filter((day) => clash.schedule.weekdays.includes(day)).map((day) => WEEKDAY_NAMES[day]).join(', ');
    const message = `${teacher.fullName} already teaches "${clash.name}" on ${days} from ${clash.schedule.startTime} to ${clash.schedule.endTime}. Choose a time that does not overlap.`;
    throw new AppError(409, message, { details: [{ field: 'schedule', message }] });
  }
}

/**
 * Refuses a change of availability that would leave one of the teacher's
 * classes outside it. The class has to be rescheduled first.
 */
export async function assertAvailabilityCoversClasses(teacher, availability) {
  const classrooms = await Classroom.find({ status: 'active', teacher: teacher._id, schedule: { $ne: null } }).select('name schedule');
  const stranded = classrooms.filter((classroom) => daysOutsideAvailability(classroom.schedule, availability).length);
  if (stranded.length) {
    throw new AppError(409, `${stranded.map(({ name }) => `"${name}"`).join(', ')} ${stranded.length === 1 ? 'is' : 'are'} scheduled outside these times. Change the class schedule first, then the availability.`);
  }
}

/** Books the class's sessions on its weekly schedule between two dates. */
async function bookSessions(classroom, sessions, context) {
  if (!sessions) return;
  if (!classroom.schedule) throw new AppError(400, 'Set the weekly schedule before booking its sessions.');
  try {
    await createSessions({
      classroomId: String(classroom._id),
      title: classroom.name,
      weekdays: [...classroom.schedule.weekdays],
      startTime: classroom.schedule.startTime,
      endTime: classroom.schedule.endTime,
      ...sessions,
    }, context);
  } catch (error) {
    // The class itself is saved by now, so say that the sessions are what failed.
    if (error instanceof AppError) {
      throw new AppError(error.statusCode, `The class was saved, but its sessions were not booked: ${error.message}`);
    }
    throw error;
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
    capacity: data.capacity,
    enrollmentOpen: data.enrollmentOpen,
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
  await bookSessions(classroom, data.sessions, { actor, ipAddress });
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
  if (data.capacity !== undefined) classroom.capacity = data.capacity;
  if (data.enrollmentOpen !== undefined) classroom.enrollmentOpen = data.enrollmentOpen;
  if (data.openAccess !== undefined) classroom.openAccess = data.openAccess;
  if (assigned.teachers) {
    classroom.teacher = assigned.teacher;
    classroom.teachers = assigned.teachers;
  }
  if (assigned.students) classroom.students = assigned.students;
  if (data.schedule !== undefined || assigned.teachers) {
    await assertScheduleFits(classroom.schedule, classroom.teacher, classroom._id);
  }
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
  await bookSessions(classroom, data.sessions, { actor, ipAddress });
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
  await rosterChanged(ids);
}

/** Takes a student back out of a classroom and its unfinished sessions, when an approval is undone. */
export async function unenrollStudent(studentId, classroomId) {
  await Classroom.updateOne({ _id: classroomId }, { $pull: { students: studentId } });
  await ClassSession.updateMany(
    { classroom: classroomId, status: 'scheduled', endsAt: { $gt: new Date() } },
    { $pull: { assignedStudents: studentId } },
  );
  await rosterChanged([classroomId]);
}

/** Connected pages follow, or stop following, the classrooms whose students changed. */
async function rosterChanged(classroomIds) {
  for (const classroom of await Classroom.find({ _id: { $in: classroomIds } })) {
    classroomPeopleChanged(classroom);
    publishToClassroom(classroom._id, SESSION_EVENTS.scheduleChanged, { classroomId: String(classroom._id) });
  }
  publishDataChanged(DATA_RESOURCES.classrooms);
}
