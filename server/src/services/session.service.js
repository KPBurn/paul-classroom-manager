import { randomUUID } from 'node:crypto';
import { Classroom } from '../models/Classroom.js';
import { ClassSession } from '../models/ClassSession.js';
import { SessionMessage } from '../models/SessionMessage.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import { attendanceStatusForCheckIn } from '../utils/attendancePolicy.js';

function localDateTimeToUtc(date, time, timezone) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  let candidate = desired;
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const adjustment = desired - represented;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate);
}

function localDay(date) {
  return date.toISOString().slice(0, 10);
}

function localDateAndTime(instant, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
    .filter((part) => part.type !== 'literal')
    .map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function occurrenceDates(data) {
  const first = new Date(`${data.startDate}T00:00:00Z`);
  const last = new Date(`${data.endDate}T00:00:00Z`);
  if (last - first > 366 * 2 * 24 * 60 * 60 * 1000) {
    throw new AppError(400, 'Recurring schedules may span at most two years');
  }
  const weekdays = new Set(data.weekdays);
  const occurrences = [];
  for (let day = first; day <= last; day = new Date(day.getTime() + 86400000)) {
    if (weekdays.has(day.getUTCDay())) {
      const date = localDay(day);
      const startsAt = localDateTimeToUtc(date, data.startTime, data.timezone);
      const endsAt = localDateTimeToUtc(date, data.endTime, data.timezone);
      if (endsAt <= startsAt) throw new AppError(400, 'End time must be after start time');
      occurrences.push({ startsAt, endsAt });
      if (occurrences.length > 500) {
        throw new AppError(400, 'Recurring schedule cannot create more than 500 sessions');
      }
    }
  }
  if (!occurrences.length) throw new AppError(400, 'The date range has no occurrence on the selected weekdays');
  return occurrences;
}

async function assignedClassroom(id, teacher, { requireActive = false } = {}) {
  const classroom = await Classroom.findById(id);
  if (!classroom) throw new AppError(404, 'Classroom not found');
  if (teacher && String(classroom.teacher) !== String(teacher._id)) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }
  if (requireActive && classroom.status !== 'active') {
    throw new AppError(400, 'Sessions cannot be created for archived classrooms');
  }
  return classroom;
}

export async function createSessions(data, { actor, ipAddress }) {
  const classroom = await assignedClassroom(data.classroomId, actor, { requireActive: true });
  let entries;
  let seriesId = null;
  if (data.startsAt) {
    if (data.endsAt <= data.startsAt) throw new AppError(400, 'End time must be after start time');
    entries = [{ startsAt: data.startsAt, endsAt: data.endsAt }];
  } else {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: data.timezone });
    } catch {
      throw new AppError(400, 'Invalid timezone');
    }
    entries = occurrenceDates(data);
    seriesId = randomUUID();
  }
  const sessions = await ClassSession.insertMany(entries.map(({ startsAt, endsAt }) => ({
    classroom: classroom._id,
    title: data.title,
    startsAt,
    endsAt,
    seriesId,
    timezone: data.timezone ?? 'UTC',
  })));
  await logActivity({
    actorId: actor._id,
    action: 'session.created',
    entityType: 'ClassSession',
    entityId: sessions[0]._id,
    description: `${actor.fullName} scheduled ${sessions.length} class session(s)`,
    ipAddress,
  });
  const created = await ClassSession.find({ _id: { $in: sessions.map((session) => session._id) } })
    .sort({ startsAt: 1 })
    .populate('classroom', 'name');
  return created.map((session) => sessionResult(session, actor));
}

async function ensureAbsences(session) {
  if (session.status !== 'cancelled' && session.endsAt <= new Date()) {
    const classroom = await Classroom.findById(session.classroom).select('students');
    if (!classroom) return;
    const marked = new Set(session.attendance.map((entry) => String(entry.student)));
    for (const student of classroom.students) {
      if (!marked.has(String(student))) {
        session.attendance.push({ student, status: 'absent' });
      }
    }
    if (session.isModified('attendance')) await session.save();
  }
}

function sessionResult(session, user) {
  const attendance = session.attendance.find((entry) => String(entry.student?._id ?? entry.student) === String(user._id));
  return {
    id: String(session._id),
    classroom: {
      id: String(session.classroom?._id ?? session.classroom),
      name: session.classroom?.name,
    },
    title: session.title,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    attendanceConditionEnabled: session.attendanceConditionEnabled ?? true,
    status: session.status,
    seriesId: session.seriesId,
    attendance: attendance
      ? { status: attendance.status, checkInAt: attendance.checkInAt ?? null }
      : { status: null, checkInAt: null },
  };
}

export async function listSessions(user, { view } = {}) {
  let classrooms;
  if (user.role === 'teacher' && !view) {
    classrooms = await Classroom.find({ teacher: user._id }).select('_id');
  } else if (user.role === 'student' && view === 'mine') {
    classrooms = await Classroom.find({ students: user._id }).select('_id');
  } else {
    throw new AppError(403, 'You do not have permission to view these sessions');
  }
  const sessions = await ClassSession.find({ classroom: { $in: classrooms.map(({ _id }) => _id) } })
    .sort({ startsAt: 1 })
    .populate('classroom', 'name');
  for (const session of sessions) await ensureAbsences(session);
  return { items: sessions.map((session) => sessionResult(session, user)) };
}

async function getSession(id) {
  const session = await ClassSession.findById(id).populate({
    path: 'classroom',
    select: 'name teacher students',
    populate: [
      { path: 'teacher', select: 'firstName lastName' },
      { path: 'students', select: 'firstName lastName email' },
    ],
  });
  if (!session) throw new AppError(404, 'Session not found');
  return session;
}

function assertAssignedTeacher(session, user) {
  if (user.role !== 'teacher' || String(session.classroom.teacher?._id ?? session.classroom.teacher) !== String(user._id)) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }
}

export async function getSessionForParticipant(id, user) {
  const session = await getSession(id);
  const isTeacher = user.role === 'teacher'
    && String(session.classroom.teacher?._id ?? session.classroom.teacher) === String(user._id);
  const isStudent = user.role === 'student'
    && session.classroom.students.some((student) => String(student._id ?? student) === String(user._id));
  if (!isTeacher && !isStudent) throw new AppError(403, 'You are not assigned to this classroom');
  return session;
}

function sessionMessageResult(message) {
  return {
    id: String(message._id),
    sender: {
      id: String(message.sender?._id ?? message.sender),
      name: message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : 'Former participant',
      role: message.sender?.role ?? 'participant',
    },
    body: message.body,
    createdAt: message.createdAt,
  };
}

export async function listSessionMessages(id, user) {
  await getSessionForParticipant(id, user);
  const messages = await SessionMessage.find({ session: id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('sender', 'firstName lastName role');
  return { items: messages.reverse().map(sessionMessageResult) };
}

export async function createSessionMessage(id, body, user) {
  await getSessionForParticipant(id, user);
  const message = await SessionMessage.create({ session: id, sender: user._id, body });
  await message.populate('sender', 'firstName lastName role');
  return sessionMessageResult(message);
}

export async function checkIn(id, user) {
  if (user.role !== 'student') throw new AppError(403, 'Only students may check in');
  const session = await getSession(id);
  if (!session.classroom.students.some((student) => String(student._id ?? student) === String(user._id))) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }
  const now = new Date();
  if (session.status === 'cancelled' || now < session.startsAt || now > session.endsAt) {
    throw new AppError(400, 'Check-in is only available during the scheduled session');
  }
  const existing = session.attendance.find((entry) => String(entry.student?._id ?? entry.student) === String(user._id));
  if (existing?.checkInAt) return sessionResult(session, user);
  const status = session.attendanceConditionEnabled === false
    ? 'present'
    : attendanceStatusForCheckIn(session.startsAt, now);
  if (existing) {
    existing.status = status;
    existing.checkInAt = now;
  } else {
    session.attendance.push({ student: user._id, status, checkInAt: now });
  }
  await session.save();
  return sessionResult(session, user);
}

export async function getAttendance(id, user) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  await ensureAbsences(session);
  const classroom = session.classroom;
  const items = classroom.students.map((student) => {
    const attendance = session.attendance.find((entry) => String(entry.student) === String(student._id));
    return {
      student: {
        id: String(student._id),
        name: `${student.firstName} ${student.lastName}`,
        email: student.email,
      },
      status: attendance?.status ?? null,
      checkInAt: attendance?.checkInAt ?? null,
    };
  });
  return { items };
}

export async function correctAttendance(id, studentId, status, user, { ipAddress }) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  const studentIsAssigned = session.classroom.students.some((student) => String(student._id) === studentId);
  if (!studentIsAssigned) throw new AppError(404, 'Student is not assigned to this classroom');
  let attendance = session.attendance.find((entry) => String(entry.student) === studentId);
  if (!attendance) {
    session.attendance.push({ student: studentId, status });
  } else {
    attendance.status = status;
  }
  await session.save();
  await logActivity({
    actorId: user._id,
    action: 'attendance.corrected',
    entityType: 'ClassSession',
    entityId: session._id,
    description: `${user.fullName} corrected attendance to ${status}`,
    ipAddress,
  });
  const result = await getAttendance(id, user);
  return { attendance: result.items };
}

export async function updateSession(id, changes, user, { ipAddress }) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  if (changes.scope === 'occurrence' && session.endsAt <= new Date()) {
    throw new AppError(400, 'Past sessions cannot be edited');
  }
  const matches = changes.scope === 'series' && session.seriesId
    ? await ClassSession.find({ seriesId: session.seriesId, startsAt: { $gt: new Date() } })
    : [session];
  if (changes.scope === 'series' && !session.seriesId) {
    throw new AppError(400, 'This session does not belong to a recurring series');
  }
  const timezone = session.timezone || 'UTC';
  const startClock = changes.startsAt ? localDateAndTime(changes.startsAt, timezone).time : null;
  const endClock = changes.endsAt ? localDateAndTime(changes.endsAt, timezone).time : null;
  for (const occurrence of matches) {
    if (changes.title !== undefined) occurrence.title = changes.title;
    if (changes.attendanceConditionEnabled !== undefined) {
      occurrence.attendanceConditionEnabled = changes.attendanceConditionEnabled;
    }
    if (changes.scope === 'occurrence') {
      if (changes.startsAt) occurrence.startsAt = changes.startsAt;
      if (changes.endsAt) occurrence.endsAt = changes.endsAt;
    } else if (startClock && endClock) {
      const localDate = localDateAndTime(occurrence.startsAt, timezone).date;
      occurrence.startsAt = localDateTimeToUtc(localDate, startClock, timezone);
      occurrence.endsAt = localDateTimeToUtc(localDate, endClock, timezone);
    }
    if (occurrence.endsAt <= occurrence.startsAt) throw new AppError(400, 'End time must be after start time');
    await occurrence.save();
  }
  await logActivity({
    actorId: user._id,
    action: 'session.updated',
    entityType: 'ClassSession',
    entityId: session._id,
    description: `${user.fullName} updated ${matches.length} session occurrence(s)`,
    ipAddress,
  });
  const updated = await ClassSession.find({ _id: { $in: matches.map((item) => item._id) } })
    .sort({ startsAt: 1 })
    .populate('classroom', 'name');
  return { items: updated.map((item) => sessionResult(item, user)) };
}

export async function cancelSession(id, scope, user, { ipAddress }) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  if (scope === 'series' && !session.seriesId) {
    throw new AppError(400, 'This session does not belong to a recurring series');
  }
  if (scope === 'occurrence' && session.endsAt <= new Date()) {
    throw new AppError(400, 'Past sessions cannot be cancelled');
  }
  const filter = scope === 'series'
    ? { seriesId: session.seriesId, startsAt: { $gt: new Date() } }
    : { _id: session._id };
  await ClassSession.updateMany(filter, { $set: { status: 'cancelled' } });
  await logActivity({
    actorId: user._id,
    action: 'session.cancelled',
    entityType: 'ClassSession',
    entityId: session._id,
    description: `${user.fullName} cancelled ${scope === 'series' ? 'a session series' : 'a session occurrence'}`,
    ipAddress,
  });
  const cancelled = await ClassSession.find({ ...filter, status: 'cancelled' })
    .sort({ startsAt: 1 })
    .populate('classroom', 'name');
  return { items: cancelled.map((occurrence) => sessionResult(occurrence, user)) };
}
