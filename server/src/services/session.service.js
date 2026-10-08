import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Classroom } from '../models/Classroom.js';
import { ClassSession } from '../models/ClassSession.js';
import { SessionFile } from '../models/SessionFile.js';
import { SessionMessage } from '../models/SessionMessage.js';
import { User } from '../models/User.js';
import {
  canJoinSession,
  canManageSession,
  classroomsTaughtBy,
  classroomTeacherIds,
  sessionStudentIds,
  sessionTeacherIds,
  teachesClassroom,
} from '../authz/policies.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import { attendanceStatusForCheckIn } from '../utils/attendancePolicy.js';
import { LIST_BATCH_SIZE } from '../config/database.js';
import { sessionTimingChanged } from '../realtime/connections.js';
import { publishToClassroom, SESSION_EVENTS } from '../realtime/sessionEvents.js';
import { resolveIceServers } from './systemSettings.service.js';

const MINUTE_MS = 60 * 1000;
/** How long a class started on the spot runs unless the teacher says otherwise. */
const DEFAULT_INSTANT_SESSION_MINUTES = 60;
/** Starting now takes over a session scheduled to begin this soon instead of adding a second one. */
const EARLY_START_WINDOW_MS = 15 * MINUTE_MS;
const START_LOCK_MS = 10_000;
const START_LOCK_RETRY_MS = 100;
const personResult = (user) => ({ id: String(user._id), name: user.fullName });

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
  if (teacher && !teachesClassroom(classroom, teacher)) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }
  if (requireActive && classroom.status !== 'active') {
    throw new AppError(400, 'Sessions cannot be created for archived classrooms');
  }
  return classroom;
}

/**
 * A session always takes everyone in its classroom: only administrators change
 * who belongs to a classroom, so scheduling never edits the roster. The session
 * keeps a snapshot of the active teachers and students at the time it is made.
 */
async function activeRoster(classroom) {
  const [teachers, students] = await Promise.all([
    User.find({ _id: { $in: classroomTeacherIds(classroom) }, role: 'teacher', status: 'active' }).select('_id'),
    User.find({ _id: { $in: classroom.students }, role: 'student', status: 'active' }).select('_id'),
  ]);
  const teacherIds = teachers.map(({ _id }) => String(_id));
  const studentIds = students.map(({ _id }) => String(_id));
  if (!teacherIds.length) {
    throw new AppError(400, 'This classroom has no active teacher. Ask an administrator to assign one.');
  }
  return { teacherIds, studentIds };
}

export async function createSessions(data, { actor, ipAddress }) {
  const classroom = await assignedClassroom(
    data.classroomId,
    actor.role === 'teacher' ? actor : null,
    { requireActive: true },
  );
  const { teacherIds, studentIds } = await activeRoster(classroom);

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
  publishToClassroom(classroom._id, SESSION_EVENTS.scheduleChanged, { classroomId: String(classroom._id) });
  return created.map((session) => sessionResult(session, actor));
}

/** Runs `work` while holding the classroom's start lock, so starting a class twice at once happens one after the other. */
async function withStartLock(classroomId, work) {
  for (let waited = 0; waited < START_LOCK_MS; waited += START_LOCK_RETRY_MS) {
    const lockedAt = new Date();
    const { modifiedCount } = await Classroom.updateOne(
      {
        _id: classroomId,
        // A lock left behind by a request that died is taken over once it is stale.
        $or: [{ sessionStartLockedAt: null }, { sessionStartLockedAt: { $lt: new Date(lockedAt.getTime() - START_LOCK_MS) } }],
      },
      { $set: { sessionStartLockedAt: lockedAt } },
      { timestamps: false },
    );
    if (modifiedCount) {
      try {
        return await work();
      } finally {
        await Classroom.updateOne(
          { _id: classroomId, sessionStartLockedAt: lockedAt },
          { $unset: { sessionStartLockedAt: '' } },
          { timestamps: false },
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, START_LOCK_RETRY_MS));
  }
  throw new AppError(409, 'This class is already being started. Please try again.');
}

/**
 * Starts a class now, with no date to enter. Asking again while the class is
 * in session gives the same session back, so a second click never makes a
 * second class. A session already scheduled to begin within fifteen minutes is
 * started early instead; otherwise a new one is made for the whole classroom.
 */
export async function startSessionNow(data, { actor, ipAddress }) {
  const classroom = await assignedClassroom(
    data.classroomId,
    actor.role === 'teacher' ? actor : null,
    { requireActive: true },
  );
  const { id, created, startedNow } = await withStartLock(classroom._id, async () => {
    const now = new Date();
    const open = { classroom: classroom._id, status: 'scheduled', endedAt: null, endsAt: { $gt: now } };
    const live = await ClassSession.findOne({ ...open, startsAt: { $lte: now } }).sort({ startsAt: -1 }).select('_id');
    if (live) return { id: live._id, created: false, startedNow: false };

    const soon = await ClassSession
      .findOne({ ...open, startsAt: { $gt: now, $lte: new Date(now.getTime() + EARLY_START_WINDOW_MS) } })
      .sort({ startsAt: 1 })
      .select('_id');
    if (soon) {
      await ClassSession.updateOne({ _id: soon._id }, { $set: { startsAt: now } });
      return { id: soon._id, created: false, startedNow: true };
    }

    const { teacherIds, studentIds } = await activeRoster(classroom);
    const session = await ClassSession.create({
      classroom: classroom._id,
      assignedTeachers: teacherIds,
      assignedStudents: studentIds,
      title: data.title ?? `${classroom.name} class`.slice(0, 120),
      startsAt: now,
      endsAt: new Date(now.getTime() + (data.durationMinutes ?? DEFAULT_INSTANT_SESSION_MINUTES) * MINUTE_MS),
    });
    return { id: session._id, created: true, startedNow: true };
  });

  const session = await ClassSession.findById(id)
    .populate('classroom', 'name openAccess')
    .populate('assignedTeachers', 'firstName lastName');
  if (startedNow) {
    await logActivity({
      actorId: actor._id,
      action: 'session.started',
      entityType: 'ClassSession',
      entityId: session._id,
      description: `${actor.fullName} started "${session.title}" in "${classroom.name}"`,
      ipAddress,
    });
    publishToClassroom(classroom._id, SESSION_EVENTS.started, {
      // The same for every reader: each one's own attendance is not part of it.
      session: sessionResult(session, { _id: null }),
      by: personResult(actor),
    });
    // Anyone already waiting in the room of a session started early is in class from now.
    sessionTimingChanged(session._id);
  }
  return { session: sessionResult(session, actor), created };
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
  // Lean documents carry no schema defaults, so nothing here may rely on one.
  const attendance = (session.attendance ?? []).find(
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
    endedAt: session.endedAt ?? null,
    seriesId: session.seriesId ?? null,
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
      : { status: missedSession(session, user) ? 'absent' : null, checkInAt: null },
  };
}

/**
 * Someone expected at a session that is over, with no attendance recorded, was
 * absent. Lists work this out as they are read; the absence is only written to
 * the session when its attendance is opened (see `ensureAbsences`).
 */
function missedSession(session, user) {
  if (session.status === 'cancelled' || session.endsAt > new Date()) return false;
  const userId = String(user._id);
  return sessionTeacherIds(session).includes(userId) || sessionStudentIds(session).includes(userId);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back a list goes when the caller does not say. */
const DEFAULT_HISTORY_DAYS = 90;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MAX_SEARCH_WORDS = 5;
const uniqueIds = (values) => [...new Set(values.filter(Boolean).map(String))];

/** The sessions a user may list: their own, plus those of open classrooms. */
async function sessionScope(user, view) {
  if (user.role === 'teacher' && !view) {
    const [assignedClassrooms, openClassrooms] = await Promise.all([
      Classroom.find(classroomsTaughtBy(user)).distinct('_id'),
      Classroom.find({ openAccess: true }).distinct('_id'),
    ]);
    return {
      $or: [
        { assignedTeachers: user._id },
        { classroom: { $in: openClassrooms } },
        { assignedTeachers: { $exists: false }, classroom: { $in: assignedClassrooms } },
      ],
    };
  }
  if (user.role === 'student' && view === 'mine') {
    const [assignedClassrooms, openClassrooms] = await Promise.all([
      Classroom.find({ students: user._id }).distinct('_id'),
      Classroom.find({ openAccess: true }).distinct('_id'),
    ]);
    return {
      $or: [
        { assignedStudents: user._id },
        { classroom: { $in: openClassrooms } },
        { assignedStudents: { $exists: false }, classroom: { $in: assignedClassrooms } },
      ],
    };
  }
  if (user.role === 'admin' && !view) return {};
  throw new AppError(403, 'You do not have permission to view these sessions');
}

/** One condition per word: it must be in the session's title, its classroom's name or a teacher's name. */
function searchConditions(search) {
  const words = (search ?? '').split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_WORDS);
  return Promise.all(words.map(async (word) => {
    const pattern = new RegExp(escapeRegex(word), 'i');
    const [classrooms, people] = await Promise.all([
      Classroom.find({ name: pattern }).distinct('_id'),
      User.find({ $or: [{ firstName: pattern }, { lastName: pattern }] }).distinct('_id'),
    ]);
    return { $or: [{ title: pattern }, { classroom: { $in: classrooms } }, { assignedTeachers: { $in: people } }] };
  }));
}

/** A page ends at a session; the cursor names it so the next page starts right after it. */
const cursorFor = (session) => Buffer
  .from(JSON.stringify([session.startsAt.toISOString(), String(session._id)]))
  .toString('base64url');

function afterCursor(cursor, direction) {
  let startsAt;
  let id;
  try {
    [startsAt, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    startsAt = new Date(startsAt);
  } catch {
    startsAt = null;
  }
  if (!startsAt || Number.isNaN(startsAt.getTime()) || typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    throw new AppError(400, 'Invalid cursor');
  }
  const beyond = direction === 1 ? '$gt' : '$lt';
  return { $or: [{ startsAt: { [beyond]: startsAt } }, { startsAt, _id: { [beyond]: id } }] };
}

/**
 * Sessions that overlap a period, oldest first (`order: 'desc'` for newest
 * first). Without `from`, the period starts 90 days ago; without `to`, it has
 * no end. Callers ask for the period they show, so a list never has to carry a
 * school's whole history.
 *
 * With `limit`, the list comes a page at a time: the result also has `total`
 * and a `nextCursor` to pass back as `cursor` for the following page.
 *
 * Each item names its teachers; students are given by id only, which is all a
 * list needs to count them.
 */
export async function listSessions(user, { view, from, to, classroomId, status, search, order, limit, cursor } = {}) {
  const [scope, words] = await Promise.all([sessionScope(user, view), searchConditions(search)]);
  const period = {
    endsAt: { $gt: from ?? new Date(Date.now() - DEFAULT_HISTORY_DAYS * DAY_MS) },
    ...(to && { startsAt: { $lt: to } }),
    ...(classroomId && { classroom: classroomId }),
    ...(status && { status }),
  };
  const conditions = [scope, period, ...words];
  const direction = order === 'desc' ? -1 : 1;

  const query = ClassSession.find({ $and: cursor ? [...conditions, afterCursor(cursor, direction)] : conditions })
    .batchSize(LIST_BATCH_SIZE)
    .lean();
  // Pages need an order with no ties, or a session could be skipped or repeated between them.
  if (limit) query.sort({ startsAt: direction, _id: direction }).limit(limit + 1);
  else query.sort({ startsAt: direction });
  const [found, total] = await Promise.all([
    query,
    limit ? ClassSession.countDocuments({ $and: conditions }) : undefined,
  ]);
  const sessions = limit ? found.slice(0, limit) : found;

  // Classrooms and teachers are looked up together, once for the whole list.
  const [classrooms, teachers] = await Promise.all([
    Classroom.find({ _id: { $in: uniqueIds(sessions.map((session) => session.classroom)) } })
      .select('name openAccess teacher teachers students')
      .lean(),
    User.find({ _id: { $in: uniqueIds(sessions.flatMap((session) => session.assignedTeachers ?? [])) } })
      .select('firstName lastName')
      .lean(),
  ]);
  const classroomById = new Map(classrooms.map((classroom) => [String(classroom._id), classroom]));
  const teacherById = new Map(teachers.map((teacher) => [String(teacher._id), teacher]));

  const items = sessions.map((session) => sessionResult({
    ...session,
    classroom: classroomById.get(String(session.classroom)) ?? null,
    assignedTeachers: session.assignedTeachers?.map((id) => teacherById.get(String(id))).filter(Boolean),
  }, user));
  if (!limit) return { items };
  return { items, total, nextCursor: found.length > limit ? cursorFor(sessions.at(-1)) : null };
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
  if (!canJoinSession(session, user)) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }
  return session;
}

/** Teachers can always enter; others are kept out of ended classes and after being removed. */
export function assertCanEnterRoom(session, user) {
  if (canManageSession(session, user)) return;
  if (session.endedAt) throw new AppError(403, 'The teacher has ended this class.');
  if ((session.removedParticipants ?? []).some((id) => String(id._id ?? id) === String(user._id))) {
    throw new AppError(403, 'You were removed from this class by the teacher.');
  }
}

export async function getRoomSession(id, user) {
  const session = await getSessionForParticipant(id, user);
  assertCanEnterRoom(session, user);
  const iceServers = await resolveIceServers();
  const hasTurnServer = iceServers.some(({ urls }) => (Array.isArray(urls) ? urls : [urls])
    .some((url) => /^(turn|turns):/i.test(url)));
  return {
    ...sessionResult(session, user),
    canManageRoom: canManageSession(session, user),
    iceServers,
    iceServersWarning: hasTurnServer
      ? null
      : 'No TURN relay is configured. Camera and microphone may stay local when direct connections are blocked. An administrator can add TURN credentials in System Settings, or in the Render environment settings.',
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

export async function removedRoomParticipants(id) {
  const session = await ClassSession.findById(id).populate('removedParticipants', 'firstName lastName');
  return (session?.removedParticipants ?? []).map((person) => ({
    userId: String(person._id),
    name: `${person.firstName} ${person.lastName}`.trim(),
  }));
}

export async function removeRoomParticipant(id, target, user) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  if (canManageSession(session, target)) throw new AppError(400, 'Teachers cannot be removed from the room');
  await ClassSession.updateOne({ _id: session._id }, { $addToSet: { removedParticipants: target._id } });
  await logActivity({
    actorId: user._id,
    action: 'session.participant-removed',
    entityType: 'ClassSession',
    entityId: session._id,
    description: `${user.fullName} removed ${target.fullName} from "${session.title}"`,
  });
  return removedRoomParticipants(id);
}

export async function readmitRoomParticipant(id, userId, user) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  await ClassSession.updateOne({ _id: session._id }, { $pull: { removedParticipants: userId } });
  return removedRoomParticipants(id);
}

export async function setRoomEnded(id, ended, user) {
  const session = await getSession(id);
  assertAssignedTeacher(session, user);
  session.endedAt = ended ? new Date() : null;
  await session.save();
  await logActivity({
    actorId: user._id,
    action: ended ? 'session.room-ended' : 'session.room-reopened',
    entityType: 'ClassSession',
    entityId: session._id,
    description: `${user.fullName} ${ended ? 'ended' : 'reopened'} the class "${session.title}"`,
  });
  const classroomId = String(session.classroom._id);
  publishToClassroom(classroomId, ended ? SESSION_EVENTS.ended : SESSION_EVENTS.reopened, {
    sessionId: String(session._id),
    classroomId,
    endedAt: session.endedAt,
    by: personResult(user),
  });
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

/** Matches a person's attendance entry; entries from before teachers were recorded name them under `student`. */
const attendanceOf = (userId) => ({ $or: [{ participant: userId }, { student: userId }] });

/**
 * Attendance is the time someone is in the room while the class is on. Each
 * stay is one interval: entering opens it (`activeSince`) and leaving adds its
 * length to `durationMs`, so leaving and coming back adds up. The server takes
 * every time from its own clock; nothing about attendance comes from the browser.
 *
 * Every step is a single conditional update, so it is safe to repeat and safe
 * when several people, or two tabs of one person, enter at the same moment.
 *
 * Tells the caller whether the class has yet to start: time in the room before
 * then is not attendance, and the caller opens the interval at the start.
 */
export async function recordRoomJoin(id, user) {
  const session = await getSessionForParticipant(id, user);
  if (session.status === 'cancelled') throw new AppError(400, 'This session has been cancelled');
  if (!['teacher', 'student'].includes(user.role)) return { beforeStart: false };
  const now = new Date();
  if (now < session.startsAt) return { beforeStart: true };
  if (now > session.endsAt) return { beforeStart: false };
  const status = session.attendanceConditionEnabled === false
    ? 'present'
    : attendanceStatusForCheckIn(session.startsAt, now);
  const mine = attendanceOf(user._id);

  // First time in: add the entry, unless another request has just added it.
  const added = await ClassSession.updateOne(
    { _id: session._id, attendance: { $not: { $elemMatch: mine } } },
    { $push: { attendance: { participant: user._id, role: user.role, status, checkInAt: now, activeSince: now, durationMs: 0 } } },
  );
  if (added.modifiedCount) return { beforeStart: false };
  // Back after leaving: open a new interval. Already in the room: nothing matches, nothing changes.
  const resumed = await ClassSession.updateOne(
    { _id: session._id, attendance: { $elemMatch: { ...mine, activeSince: null, checkInAt: { $ne: null } } } },
    { $set: { 'attendance.$.activeSince': now }, $unset: { 'attendance.$.leftAt': '' } },
  );
  if (resumed.modifiedCount) return { beforeStart: false };
  // Marked without ever having joined (an absence a teacher recorded): this is the check-in.
  await ClassSession.updateOne(
    { _id: session._id, attendance: { $elemMatch: { ...mine, activeSince: null, checkInAt: null } } },
    {
      $set: {
        'attendance.$.activeSince': now,
        'attendance.$.checkInAt': now,
        'attendance.$.status': status,
        'attendance.$.role': user.role,
      },
      $unset: { 'attendance.$.leftAt': '' },
    },
  );
  return { beforeStart: false };
}

/** Closes the interval that is open, if there is one, counting no time past the end of the session. */
async function closeAttendanceInterval(session, userId, at) {
  const entry = attendanceForUser(session, userId);
  if (!entry?.activeSince) return;
  const leftAt = new Date(Math.min(at.getTime(), session.endsAt.getTime()));
  await ClassSession.updateOne(
    // Only if that interval is still the open one, so closing twice counts once.
    { _id: session._id, attendance: { $elemMatch: { ...attendanceOf(userId), activeSince: entry.activeSince } } },
    {
      $inc: { 'attendance.$.durationMs': Math.max(0, leftAt - entry.activeSince) },
      $set: { 'attendance.$.leftAt': leftAt },
      $unset: { 'attendance.$.activeSince': '' },
    },
  );
}

export async function recordRoomLeave(id, user) {
  const session = await ClassSession.findById(id).select('endsAt attendance').lean();
  if (session) await closeAttendanceInterval(session, user._id, new Date());
}

/**
 * For the server's start-up. Nobody is in a room yet, so an interval still
 * open was cut off when the server stopped; it is closed here instead of
 * running on to the end of the session. People who come back open a new one.
 */
export async function closeInterruptedAttendance(at = new Date()) {
  const sessions = await ClassSession
    .find({ startsAt: { $lte: at }, attendance: { $elemMatch: { activeSince: { $type: 'date' } } } })
    .select('endsAt attendance')
    .lean();
  for (const session of sessions) {
    for (const entry of session.attendance) {
      if (entry.activeSince) await closeAttendanceInterval(session, entry.participant ?? entry.student, at);
    }
  }
  return sessions.length;
}

/** When a session starts, for the live room to open attendance for people who came early. */
export async function sessionStartTime(id) {
  const session = await ClassSession.findById(id).select('startsAt status').lean();
  return session && session.status !== 'cancelled' ? session.startsAt : null;
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
  publishToClassroom(session.classroom._id, SESSION_EVENTS.scheduleChanged, { classroomId: String(session.classroom._id) });
  if (changes.startsAt) for (const occurrence of matches) sessionTimingChanged(occurrence._id);
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
  publishToClassroom(session.classroom._id, SESSION_EVENTS.scheduleChanged, { classroomId: String(session.classroom._id) });
  const cancelled = await ClassSession.find({ ...filter, status: 'cancelled' })
    .sort({ startsAt: 1 })
    .populate('classroom', 'name');
  return { items: cancelled.map((occurrence) => sessionResult(occurrence, user)) };
}
