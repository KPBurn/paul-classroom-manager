import { randomUUID } from 'node:crypto';
import { Classroom } from '../models/Classroom.js';
import { ClassSession } from '../models/ClassSession.js';
import { SessionFile } from '../models/SessionFile.js';
import { SessionMessage } from '../models/SessionMessage.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import { attendanceStatusForCheckIn } from '../utils/attendancePolicy.js';
import { env } from '../config/environment.js';

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
  if (teacher && !isAssignedTeacher(classroom, teacher)) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }
  if (requireActive && classroom.status !== 'active') {
    throw new AppError(400, 'Sessions cannot be created for archived classrooms');
  }
  return classroom;
}

export function isAssignedTeacher(classroom, user) {
  if (user?.role !== 'teacher') return false;
  const assignedIds = [classroom.teacher, ...(classroom.teachers ?? [])]
    .filter(Boolean)
    .map((teacher) => String(teacher._id ?? teacher));
  return assignedIds.includes(String(user._id));
}

function classroomTeacherIds(classroom) {
  return [...new Set([classroom.teacher, ...(classroom.teachers ?? [])]
    .filter(Boolean)
    .map((teacher) => String(teacher._id ?? teacher)))];
}

function sessionTeacherIds(session) {
  return session.assignedTeachers
    ? session.assignedTeachers.map((teacher) => String(teacher._id ?? teacher))
    : classroomTeacherIds(session.classroom);
}

function sessionStudentIds(session) {
  return session.assignedStudents
    ? session.assignedStudents.map((student) => String(student._id ?? student))
    : session.classroom.students.map((student) => String(student._id ?? student));
}

export function isSessionTeacher(session, user) {
  return user?.role === 'teacher' && sessionTeacherIds(session).includes(String(user._id));
}

export function canManageSession(session, user) {
  return user?.role === 'admin' || isSessionTeacher(session, user);
}

export async function getAssignmentOptions(classroomId, user) {
  const classroom = await Classroom.findById(classroomId);
  if (!classroom) throw new AppError(404, 'Classroom not found');
  if (classroom.status !== 'active') throw new AppError(400, 'Archived classrooms cannot be scheduled');
  if (user.role === 'teacher' && !isAssignedTeacher(classroom, user)) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }

  const [teachers, students] = await Promise.all([
    User.find({ role: 'teacher', status: 'active' })
      .select('firstName lastName email')
      .sort({ firstName: 1, lastName: 1, _id: 1 })
      .limit(100),
    User.find({ role: 'student', status: 'active' })
      .select('firstName lastName email')
      .sort({ firstName: 1, lastName: 1, _id: 1 })
      .limit(500),
  ]);
  return { teachers, students };
}

export async function createSessions(data, { actor, ipAddress }) {
  const classroom = await assignedClassroom(
    data.classroomId,
    actor.role === 'teacher' ? actor : null,
    { requireActive: true },
  );
  const teacherIds = [...new Set(data.teacherIds ?? classroomTeacherIds(classroom))];
  const studentIds = [...new Set((data.studentIds ?? classroom.students)
    .map((student) => String(student._id ?? student)))];
  if (!teacherIds.length) throw new AppError(400, 'Assign at least one teacher to the classroom');
  if (actor.role === 'teacher' && !teacherIds.includes(String(actor._id))) {
    throw new AppError(400, 'You must remain assigned to the classroom to schedule its sessions');
  }
  const [teachers, students] = await Promise.all([
    User.find({ _id: { $in: teacherIds }, role: 'teacher', status: 'active' }).select('_id'),
    User.find({ _id: { $in: studentIds }, role: 'student', status: 'active' }).select('_id'),
  ]);
  if (teachers.length !== teacherIds.length) {
    throw new AppError(400, 'Teachers must reference active teacher accounts');
  }
  if (students.length !== studentIds.length) {
    throw new AppError(400, 'Students must reference active student accounts');
  }

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
  classroom.teacher = teacherIds[0];
  classroom.teachers = teacherIds;
  classroom.students = studentIds;
  await classroom.save();

  const sessions = await ClassSession.insertMany(entries.map(({ startsAt, endsAt }) => ({
    classroom: classroom._id,
    assignedTeachers: teacherIds,
    assignedStudents: studentIds,
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
    description: `${actor.fullName} scheduled ${sessions.length} session(s) for "${classroom.name}" with ${teacherIds.length} teacher(s) and ${studentIds.length} student(s)`,
    ipAddress,
  });
  const created = await ClassSession.find({ _id: { $in: sessions.map((session) => session._id) } })
    .sort({ startsAt: 1 })
    .populate('classroom', 'name openAccess')
    .populate('assignedTeachers', 'firstName lastName')
    .populate('assignedStudents', 'firstName lastName email');
  return created.map((session) => sessionResult(session, actor));
}

async function ensureAbsences(session) {
  if (session.status !== 'cancelled' && session.endsAt <= new Date()) {
    const classroom = session.classroom?._id
      ? session.classroom
      : await Classroom.findById(session.classroom).populate('teacher teachers students');
    if (!classroom) return;
    const roster = [
      ...new Map([
        ...((session.assignedTeachers ?? classroomTeacherIds(classroom)).map((teacher) => [
          String(teacher._id ?? teacher),
          { participant: teacher._id ?? teacher, role: 'teacher' },
        ])),
        ...((session.assignedStudents ?? classroom.students).map((student) => [
          String(student._id ?? student),
          { participant: student._id ?? student, role: 'student' },
        ])),
      ]).values(),
    ];
    for (const person of roster) {
      const personId = String(person.participant);
      const entry = session.attendance.find(
        (attendance) => String(attendance.participant ?? attendance.student) === personId,
      );
      if (!entry) {
        session.attendance.push({ ...person, status: 'absent' });
      } else if (entry.activeSince) {
        entry.durationMs = (entry.durationMs ?? 0) + Math.max(0, session.endsAt - entry.activeSince);
        entry.leftAt = session.endsAt;
        entry.activeSince = undefined;
      }
    }
    if (session.isModified('attendance')) await session.save();
  }
}

function sessionResult(session, user) {
  const attendance = session.attendance.find(
    (entry) => String(entry.participant?._id ?? entry.participant ?? entry.student?._id ?? entry.student) === String(user._id),
  );
  return {
    id: String(session._id),
    classroom: {
      id: String(session.classroom?._id ?? session.classroom),
      name: session.classroom?.name,
      openAccess: session.classroom?.openAccess ?? false,
    },
    title: session.title,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    attendanceConditionEnabled: session.attendanceConditionEnabled ?? true,
    roomSettings: {
      screenSharingEnabled: session.screenSharingEnabled ?? true,
      fileUploadsEnabled: session.fileUploadsEnabled ?? true,
    },
    status: session.status,
    seriesId: session.seriesId,
    assignments: {
      teachers: (session.assignedTeachers ?? classroomTeacherIds(session.classroom ?? {})).map((teacher) => ({
        id: String(teacher._id ?? teacher),
        name: teacher.firstName
          ? `${teacher.firstName} ${teacher.lastName}`.trim()
          : undefined,
      })),
      students: (session.assignedStudents ?? session.classroom?.students ?? []).map((student) => ({
        id: String(student._id ?? student),
        name: student.firstName
          ? `${student.firstName} ${student.lastName}`.trim()
          : undefined,
      })),
    },
    attendance: attendance
      ? {
          status: attendance.status,
          checkInAt: attendance.checkInAt ?? null,
          leftAt: attendance.leftAt ?? null,
          durationMs: attendance.durationMs ?? 0,
        }
      : { status: null, checkInAt: null },
  };
}

export async function listSessions(user, { view } = {}) {
  let filter;
  if (user.role === 'teacher' && !view) {
    const [assignedClassrooms, openClassrooms] = await Promise.all([
      Classroom.find({ $or: [{ teacher: user._id }, { teachers: user._id }] }).select('_id'),
      Classroom.find({ openAccess: true }).select('_id'),
    ]);
    filter = {
      $or: [
        { assignedTeachers: user._id },
        { classroom: { $in: openClassrooms.map(({ _id }) => _id) } },
        {
          assignedTeachers: { $exists: false },
          classroom: { $in: assignedClassrooms.map(({ _id }) => _id) },
        },
      ],
    };
  } else if (user.role === 'student' && view === 'mine') {
    const [assignedClassrooms, openClassrooms] = await Promise.all([
      Classroom.find({ students: user._id }).select('_id'),
      Classroom.find({ openAccess: true }).select('_id'),
    ]);
    filter = {
      $or: [
        { assignedStudents: user._id },
        { classroom: { $in: openClassrooms.map(({ _id }) => _id) } },
        {
          assignedStudents: { $exists: false },
          classroom: { $in: assignedClassrooms.map(({ _id }) => _id) },
        },
      ],
    };
  } else if (user.role === 'admin' && !view) {
    filter = {};
  } else {
    throw new AppError(403, 'You do not have permission to view these sessions');
  }
  const sessions = await ClassSession.find(filter)
    .sort({ startsAt: 1 })
    .populate({
      path: 'classroom',
      select: 'name openAccess teacher teachers students',
      populate: [
        { path: 'teacher', select: 'firstName lastName' },
        { path: 'teachers', select: 'firstName lastName' },
        { path: 'students', select: 'firstName lastName email' },
      ],
    })
    .populate('assignedTeachers', 'firstName lastName')
      .populate('assignedStudents', 'firstName lastName email')
      .populate('attendance.participant', 'firstName lastName email role')
      .populate('attendance.student', 'firstName lastName email role');
  for (const session of sessions) await ensureAbsences(session);
  return { items: sessions.map((session) => sessionResult(session, user)) };
}

async function getSession(id) {
  const session = await ClassSession.findById(id).populate({
    path: 'classroom',
    select: 'name teacher teachers students openAccess',
    populate: [
      { path: 'teacher', select: 'firstName lastName' },
      { path: 'teachers', select: 'firstName lastName' },
      { path: 'students', select: 'firstName lastName email' },
    ],
  })
    .populate('assignedTeachers', 'firstName lastName')
    .populate('assignedStudents', 'firstName lastName email')
    .populate('attendance.participant', 'firstName lastName email role')
    .populate('attendance.student', 'firstName lastName email role');
  if (!session) throw new AppError(404, 'Session not found');
  return session;
}

function assertAssignedTeacher(session, user) {
  if (!canManageSession(session, user)) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }
}

export async function getSessionForParticipant(id, user) {
  const session = await getSession(id);
  const isTeacher = isSessionTeacher(session, user);
  const isAdmin = user.role === 'admin';
  const isStudent = user.role === 'student'
    && sessionStudentIds(session).includes(String(user._id));
  if (!isAdmin && !isTeacher && !isStudent && !session.classroom.openAccess) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }
  return session;
}

export async function getRoomSession(id, user) {
  const session = await getSessionForParticipant(id, user);
  return {
    ...sessionResult(session, user),
    canManageRoom: canManageSession(session, user),
    iceServers: env.iceServers,
  };
}

export async function updateRoomSettings(id, settings, user) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  if (session.status === 'cancelled' || session.endsAt <= new Date()) {
    throw new AppError(400, 'Room settings cannot be changed after the session ends');
  }
  if (settings.screenSharingEnabled !== undefined) {
    session.screenSharingEnabled = settings.screenSharingEnabled;
  }
  if (settings.fileUploadsEnabled !== undefined) {
    session.fileUploadsEnabled = settings.fileUploadsEnabled;
  }
  await session.save();
  return {
    screenSharingEnabled: session.screenSharingEnabled,
    fileUploadsEnabled: session.fileUploadsEnabled,
  };
}

function sessionFileResult(file) {
  return {
    id: String(file._id),
    name: file.name,
    size: file.size,
    uploadedAt: file.createdAt,
    uploader: file.uploader
      ? {
          id: String(file.uploader._id ?? file.uploader),
          name: `${file.uploader.firstName ?? ''} ${file.uploader.lastName ?? ''}`.trim(),
        }
      : null,
  };
}

export async function listSessionFiles(id, user) {
  const session = await getSessionForParticipant(id, user);
  const now = new Date();
  if (session.status === 'cancelled' || session.endsAt <= now) {
    await SessionFile.deleteMany({ session: id });
    return { items: [] };
  }
  await SessionFile.deleteMany({ session: id, expiresAt: { $lte: now } });
  const files = await SessionFile.find({ session: id, expiresAt: { $gt: now } })
    .select('-data')
    .sort({ createdAt: -1 })
    .populate('uploader', 'firstName lastName');
  return { items: files.map(sessionFileResult) };
}

export async function createSessionFile(id, { name, data }, user) {
  const session = await getSessionForParticipant(id, user);
  if (session.status === 'cancelled' || session.endsAt <= new Date()) {
    throw new AppError(400, 'Files can only be uploaded while the session is active');
  }
  if (!session.fileUploadsEnabled) {
    throw new AppError(403, 'File uploads are disabled by the teacher');
  }
  const file = await SessionFile.create({
    session: session._id,
    uploader: user._id,
    name,
    size: data.length,
    data,
    expiresAt: session.endsAt,
  });
  await file.populate('uploader', 'firstName lastName');
  return sessionFileResult(file);
}

export async function getSessionFile(id, fileId, user) {
  const session = await getSessionForParticipant(id, user);
  if (session.status === 'cancelled' || session.endsAt <= new Date()) {
    await SessionFile.deleteMany({ session: id });
    throw new AppError(404, 'File not found or the session has ended');
  }
  const file = await SessionFile.findOne({
    _id: fileId,
    session: id,
    expiresAt: { $gt: new Date() },
  })
    .select('+data')
    .populate('uploader', 'firstName lastName');
  if (!file) throw new AppError(404, 'File not found or the session has ended');
  return { ...sessionFileResult(file), data: file.data };
}

function sessionMessageResult(message) {
  const system = message.type === 'system';
  return {
    id: String(message._id),
    type: message.type ?? 'user',
    sender: system ? { id: 'system', name: 'Classroom', role: 'system' } : {
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

function attendanceForUser(session, userId) {
  return session.attendance.find(
    (entry) => String(entry.participant?._id ?? entry.participant ?? entry.student?._id ?? entry.student) === String(userId),
  );
}

export async function recordRoomJoin(id, user) {
  const session = await getSessionForParticipant(id, user);
  if (session.status === 'cancelled') throw new AppError(400, 'This session has been cancelled');
  if (!['teacher', 'student'].includes(user.role)) return session;
  const now = new Date();
  if (now < session.startsAt || now > session.endsAt) return session;
  let entry = attendanceForUser(session, user._id);
  if (!entry) {
    entry = {
      participant: user._id,
      role: user.role,
      status: session.attendanceConditionEnabled === false ? 'present' : attendanceStatusForCheckIn(session.startsAt, now),
      checkInAt: now,
      activeSince: now,
      durationMs: 0,
    };
    session.attendance.push(entry);
  } else if (!entry.activeSince) {
    if (!entry.checkInAt) {
      entry.role = user.role;
      entry.status = session.attendanceConditionEnabled === false
        ? 'present'
        : attendanceStatusForCheckIn(session.startsAt, now);
      entry.checkInAt = now;
    }
    entry.activeSince = now;
    entry.leftAt = undefined;
  }
  await session.save();
  return session;
}

export async function recordRoomLeave(id, user) {
  const session = await getSession(id);
  const entry = attendanceForUser(session, user._id);
  if (entry?.activeSince) {
    const leftAt = new Date(Math.min(Date.now(), session.endsAt.getTime()));
    entry.durationMs = (entry.durationMs ?? 0) + Math.max(0, leftAt - entry.activeSince);
    entry.leftAt = leftAt;
    entry.activeSince = undefined;
    await session.save();
  }
  return session;
}

export async function createRoomActivity(id, user, action) {
  const session = await getSessionForParticipant(id, user);
  if (!session.classroom.openAccess) return null;
  const message = await SessionMessage.create({
    session: session._id,
    type: 'system',
    body: `${user.firstName} ${user.lastName} ${action} the classroom`,
  });
  return sessionMessageResult(message);
}

export async function getAttendance(id, user) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  await ensureAbsences(session);
  const assignedTeachers = session.assignedTeachers
    ?? [session.classroom.teacher, ...(session.classroom.teachers ?? [])].filter(Boolean);
  const assignedPeople = [
    ...assignedTeachers
      .map((teacher) => ({ participant: teacher, role: 'teacher' })),
    ...(session.assignedStudents ?? session.classroom.students)
      .map((student) => ({ participant: student, role: 'student' })),
  ];
  const people = new Map(assignedPeople.map(({ participant, role }) => [
    String(participant._id ?? participant),
    { participant, role },
  ]));
  for (const entry of session.attendance) {
    const participant = entry.participant ?? entry.student;
    if (participant?._id) {
      const participantId = String(participant._id);
      if (!people.has(participantId) || participant.firstName) {
        people.set(participantId, { participant, role: entry.role ?? participant.role });
      }
    }
  }
  const items = [...people.values()].map(({ participant, role }) => {
    const participantId = String(participant._id ?? participant);
    const attendance = attendanceForUser(session, participantId);
    const details = participant.firstName ? {
      id: participantId,
      name: `${participant.firstName} ${participant.lastName}`,
      email: participant.email,
      role: role ?? participant.role,
    } : {
      id: participantId,
      name: 'Participant',
      role: role ?? 'student',
    };
    return {
      participant: details,
      student: details,
      role: details.role,
      status: attendance?.status ?? null,
      checkInAt: attendance?.checkInAt ?? null,
      leftAt: attendance?.leftAt ?? null,
      durationMs: (attendance?.durationMs ?? 0)
        + (attendance?.activeSince ? Math.max(0, Date.now() - attendance.activeSince.getTime()) : 0),
    };
  });
  items.sort((left, right) => left.participant.name.localeCompare(right.participant.name));
  return { items };
}

export async function correctAttendance(id, studentId, status, user, { ipAddress }) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  const assignedTeacherIds = sessionTeacherIds(session);
  const isAssigned = sessionStudentIds(session).includes(studentId) || assignedTeacherIds.includes(studentId);
  const attendance = attendanceForUser(session, studentId);
  if (!isAssigned && !attendance) throw new AppError(404, 'Participant is not assigned to or present in this classroom');
  if (!attendance) {
    session.attendance.push({
      participant: studentId,
      role: assignedTeacherIds.includes(studentId) ? 'teacher' : 'student',
      status,
    });
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
    await SessionFile.updateMany(
      { session: occurrence._id },
      { $set: { expiresAt: occurrence.endsAt } },
    );
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
  await SessionFile.deleteMany({ session: { $in: await ClassSession.find(filter).distinct('_id') } });
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
