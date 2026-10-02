import { LIST_BATCH_SIZE } from '../config/database.js';
import { Classroom } from '../models/Classroom.js';
import { ClassSession } from '../models/ClassSession.js';
import { TeacherFeedback } from '../models/TeacherFeedback.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import { canManageSession, classroomsTaughtBy, isSessionTeacher } from '../authz/policies.js';

const PERSON_FIELDS = 'firstName lastName email';
const idOf = (value) => String(value?._id ?? value);
const nameOf = (person) => (person?.firstName ? `${person.firstName} ${person.lastName}`.trim() : null);

/** What must be filled in before feedback can be submitted; drafts can be saved incomplete. */
const REQUIRED_ON_SUBMIT = [
  { field: 'whatWeLearned', message: 'Describe what you covered in the lesson', value: (fb) => fb.whatWeLearned },
  { field: 'speaking.fluency', message: 'Rate fluency', value: (fb) => fb.speaking?.fluency },
  { field: 'speaking.pronunciation', message: 'Rate pronunciation', value: (fb) => fb.speaking?.pronunciation },
  { field: 'speaking.confidence', message: 'Rate confidence', value: (fb) => fb.speaking?.confidence },
  { field: 'didWell', message: 'Describe what the student did well', value: (fb) => fb.didWell },
  { field: 'needsImprovement', message: 'Describe what needs improvement', value: (fb) => fb.needsImprovement },
  { field: 'recommendation', message: 'Add a recommendation for the next lesson', value: (fb) => fb.recommendation },
];

function assertSubmittable(feedback) {
  const details = REQUIRED_ON_SUBMIT
    .filter(({ value }) => {
      const current = value(feedback);
      return current === null || current === undefined || (typeof current === 'string' && !current.trim());
    })
    .map(({ field, message }) => ({ field, message }));
  if (details.length) {
    throw new AppError(400, 'Complete the required fields before submitting', {
      error: 'Some required feedback is missing',
      details,
    });
  }
}

async function loadSession(id) {
  const session = await ClassSession.findById(id)
    .populate({
      path: 'classroom',
      select: 'name teacher teachers students status',
      populate: { path: 'students', select: PERSON_FIELDS },
    })
    .populate('assignedStudents', PERSON_FIELDS);
  if (!session) throw new AppError(404, 'Lesson not found');
  return session;
}

/** The students expected at a lesson: its assignment snapshot, or the classroom roster for older sessions. */
function lessonStudents(session) {
  return session.assignedStudents ?? session.classroom?.students ?? [];
}

const withDetails = (query) => query
  .populate('teacher', 'firstName lastName')
  .populate('student', PERSON_FIELDS)
  .populate('classroom', 'name')
  .populate('session', 'title startsAt endsAt seriesId status');

function feedbackResult(feedback) {
  const json = feedback.toJSON();
  return {
    ...json,
    teacher: { id: idOf(feedback.teacher), name: nameOf(feedback.teacher) },
    student: { id: idOf(feedback.student), name: nameOf(feedback.student), email: feedback.student?.email },
    classroom: { id: idOf(feedback.classroom), name: feedback.classroom?.name },
    session: {
      id: idOf(feedback.session),
      title: feedback.session?.title,
      startsAt: feedback.session?.startsAt ?? feedback.lessonAt,
      endsAt: feedback.session?.endsAt,
      seriesId: feedback.session?.seriesId ?? null,
    },
  };
}

/** Students of a lesson with their feedback status, for working through a class. */
export async function getLessonRoster(sessionId, user) {
  const session = await loadSession(sessionId);
  if (!canManageSession(session, user)) {
    throw new AppError(403, 'You are not assigned to this lesson');
  }
  const [feedback, lastWithBook] = await Promise.all([
    TeacherFeedback.find({ session: session._id }).populate('teacher', 'firstName lastName'),
    TeacherFeedback.findOne({ classroom: session.classroom._id, book: { $ne: '' } }).sort({ lessonAt: -1 }).select('book'),
  ]);
  const byStudent = new Map(feedback.map((item) => [idOf(item.student), item]));
  // What was taught is usually the same for the whole class, so offer this teacher's most
  // recently saved lesson details for prefilling the next student's feedback.
  const latestOwn = feedback
    .filter((item) => idOf(item.teacher) === String(user._id)
      && (item.whatWeLearned || item.vocabulary?.newWords || item.grammar?.topic))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const latestStudent = latestOwn && lessonStudents(session).find((student) => idOf(student) === idOf(latestOwn.student));

  return {
    lesson: {
      id: idOf(session),
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      status: session.status,
      seriesId: session.seriesId ?? null,
      classroom: { id: idOf(session.classroom), name: session.classroom?.name },
    },
    // Teachers usually keep the same book across lessons, so offer the last one used.
    suggestedBook: lastWithBook?.book ?? '',
    lessonDefaults: latestOwn
      ? {
          fromStudent: { id: idOf(latestOwn.student), name: nameOf(latestStudent) ?? 'another student' },
          book: latestOwn.book,
          whatWeLearned: latestOwn.whatWeLearned,
          newWords: latestOwn.vocabulary?.newWords ?? '',
          grammarTopic: latestOwn.grammar?.topic ?? '',
        }
      : null,
    students: lessonStudents(session)
      .map((student) => {
        const item = byStudent.get(idOf(student));
        return {
          id: idOf(student),
          name: nameOf(student) ?? 'Student',
          email: student.email,
          feedback: item
            ? {
                id: idOf(item),
                status: item.status,
                teacher: { id: idOf(item.teacher), name: nameOf(item.teacher) },
                updatedAt: item.updatedAt,
                submittedAt: item.submittedAt,
              }
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_WINDOW_DAYS = 14;
// Feedback is a gentle reminder for the first week after a lesson, then counts as overdue.
const OVERDUE_AFTER_DAYS = 7;
const PENDING_LIMIT = 20;

/**
 * The teacher's lessons from the last two weeks that still have students
 * without completed feedback, newest first, with the next student to open
 * and totals for reminders.
 */
export async function listPendingLessons(user) {
  const now = new Date();
  const since = new Date(now.getTime() - PENDING_WINDOW_DAYS * DAY_MS);
  const classrooms = await Classroom.find(classroomsTaughtBy(user)).select('_id');
  const sessions = await ClassSession.find({
    status: 'scheduled',
    startsAt: { $gte: since, $lte: now },
    $or: [
      { assignedTeachers: user._id },
      { assignedTeachers: { $exists: false }, classroom: { $in: classrooms.map(({ _id }) => _id) } },
    ],
  })
    .sort({ startsAt: -1 })
    .limit(200)
    .select('title startsAt classroom assignedStudents')
    .batchSize(LIST_BATCH_SIZE)
    .lean();
  const summary = { lessons: 0, students: 0, overdueLessons: 0, overdueStudents: 0 };
  if (!sessions.length) return { items: [], summary };

  // Feedback, classrooms and the lessons' students are looked up together.
  const namesOf = (ids) => User.find({ _id: { $in: ids } }).select('firstName lastName').batchSize(LIST_BATCH_SIZE).lean();
  const [feedback, lessonClassrooms, snapshotStudents] = await Promise.all([
    TeacherFeedback.find({ session: { $in: sessions.map(({ _id }) => _id) } })
      .select('session student teacher status')
      .lean(),
    Classroom.find({ _id: { $in: sessions.map((session) => session.classroom) } }).select('name students').lean(),
    namesOf(sessions.flatMap((session) => session.assignedStudents ?? [])),
  ]);
  const classroomById = new Map(lessonClassrooms.map((classroom) => [idOf(classroom), classroom]));
  const studentById = new Map(snapshotStudents.map((student) => [idOf(student), student]));
  // Older sessions have no snapshot of their own and take the classroom's roster.
  const rosterIds = sessions
    .filter((session) => !session.assignedStudents)
    .flatMap((session) => classroomById.get(idOf(session.classroom))?.students ?? [])
    .filter((id) => !studentById.has(idOf(id)));
  for (const student of rosterIds.length ? await namesOf(rosterIds) : []) studentById.set(idOf(student), student);
  const studentsOf = (session) => (session.assignedStudents ?? classroomById.get(idOf(session.classroom))?.students ?? [])
    .map((id) => studentById.get(idOf(id)))
    .filter(Boolean);

  const bySession = new Map();
  for (const item of feedback) {
    const key = idOf(item.session);
    bySession.set(key, [...(bySession.get(key) ?? []), item]);
  }

  const items = [];
  for (const session of sessions) {
    const records = new Map((bySession.get(idOf(session)) ?? []).map((item) => [idOf(item.student), item]));
    const students = studentsOf(session).sort((a, b) => (nameOf(a) ?? '').localeCompare(nameOf(b) ?? ''));
    const completed = students.filter((student) => records.get(idOf(student))?.status === 'completed').length;
    const drafts = students.filter((student) => {
      const record = records.get(idOf(student));
      return record?.status === 'draft' && idOf(record.teacher) === String(user._id);
    }).length;
    // Students this teacher still has to write for: nothing yet, or their own unfinished draft.
    const waiting = students.filter((student) => {
      const record = records.get(idOf(student));
      return !record || (record.status === 'draft' && idOf(record.teacher) === String(user._id));
    });
    if (!waiting.length) continue;
    const daysAgo = Math.floor((now.getTime() - session.startsAt.getTime()) / DAY_MS);
    const overdue = daysAgo >= OVERDUE_AFTER_DAYS;
    summary.lessons += 1;
    summary.students += waiting.length;
    if (overdue) {
      summary.overdueLessons += 1;
      summary.overdueStudents += waiting.length;
    }
    if (items.length < PENDING_LIMIT) {
      items.push({
        lesson: {
          id: idOf(session),
          title: session.title,
          startsAt: session.startsAt,
          classroom: { id: idOf(session.classroom), name: classroomById.get(idOf(session.classroom))?.name },
        },
        total: students.length,
        completed,
        drafts,
        left: waiting.length,
        daysAgo,
        overdue,
        nextStudent: { id: idOf(waiting[0]), name: nameOf(waiting[0]) ?? 'Student' },
      });
    }
  }
  return { items, summary };
}

/** Teachers see the feedback they wrote; admins see everyone's. */
export async function listFeedback({ page, limit, classroomId, studentId, teacherId, status, from, to }, user) {
  const filter = {};
  if (user.role === 'teacher') filter.teacher = user._id;
  else if (teacherId) filter.teacher = teacherId;
  if (classroomId) filter.classroom = classroomId;
  if (studentId) filter.student = studentId;
  if (status) filter.status = status;
  if (from || to) {
    filter.lessonAt = {};
    if (from) filter.lessonAt.$gte = from;
    if (to) filter.lessonAt.$lte = to;
  }

  const [items, total] = await Promise.all([
    withDetails(TeacherFeedback.find(filter)
      .sort({ lessonAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)),
    TeacherFeedback.countDocuments(filter),
  ]);
  return {
    items: items.map(feedbackResult),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function findFeedback(id) {
  const feedback = await withDetails(TeacherFeedback.findById(id));
  if (!feedback) throw new AppError(404, 'Feedback not found');
  return feedback;
}

/** The author, the lesson's other teachers and admins can read feedback. */
export async function getFeedback(id, user) {
  const feedback = await findFeedback(id);
  if (user.role === 'admin' || idOf(feedback.teacher) === String(user._id)) return feedbackResult(feedback);
  const session = await loadSession(idOf(feedback.session));
  if (isSessionTeacher(session, user)) return feedbackResult(feedback);
  throw new AppError(403, 'You do not have access to this feedback');
}

function applyContent(feedback, data) {
  for (const field of ['book', 'whatWeLearned', 'didWell', 'needsImprovement', 'recommendation', 'notes']) {
    if (data[field] !== undefined) feedback[field] = data[field];
  }
  for (const group of ['vocabulary', 'grammar', 'speaking']) {
    if (data[group]) {
      for (const [key, value] of Object.entries(data[group])) feedback[group][key] = value;
    }
  }
}

function applyStatus(feedback, requested) {
  // Submitted feedback stays submitted when it is edited later.
  if (requested === 'completed' || feedback.status === 'completed') {
    assertSubmittable(feedback);
    if (feedback.status !== 'completed') {
      feedback.status = 'completed';
      feedback.submittedAt = new Date();
    }
  }
}

export async function createFeedback({ sessionId, studentId, status, ...content }, { actor, ipAddress }) {
  const session = await loadSession(sessionId);
  if (!isSessionTeacher(session, actor)) throw new AppError(403, 'You are not assigned to this lesson');
  if (session.status === 'cancelled') throw new AppError(400, 'Feedback cannot be written for a cancelled lesson');
  const student = lessonStudents(session).find((item) => idOf(item) === studentId);
  if (!student) throw new AppError(400, 'This student is not part of the lesson');

  const existing = await TeacherFeedback.findOne({ session: session._id, student: studentId }).select('_id');
  if (existing) throw new AppError(409, 'Feedback already exists for this student and lesson');

  const feedback = new TeacherFeedback({
    teacher: actor._id,
    student: studentId,
    classroom: session.classroom._id,
    session: session._id,
    lessonAt: session.startsAt,
  });
  applyContent(feedback, content);
  applyStatus(feedback, status);
  await feedback.save();

  await logActivity({
    actorId: actor._id,
    action: feedback.status === 'completed' ? 'feedback.submitted' : 'feedback.drafted',
    entityType: 'TeacherFeedback',
    entityId: feedback._id,
    description: `${actor.fullName} ${feedback.status === 'completed' ? 'submitted' : 'started'} feedback for ${nameOf(student) ?? 'a student'} (${session.title})`,
    ipAddress,
  });
  return feedbackResult(await findFeedback(feedback._id));
}

export async function updateFeedback(id, { status, ...content }, { actor, ipAddress }) {
  const feedback = await TeacherFeedback.findById(id);
  if (!feedback) throw new AppError(404, 'Feedback not found');
  if (String(feedback.teacher) !== String(actor._id)) {
    throw new AppError(403, 'Only the teacher who wrote this feedback can change it');
  }
  const wasCompleted = feedback.status === 'completed';
  applyContent(feedback, content);
  applyStatus(feedback, status);
  await feedback.save();

  await logActivity({
    actorId: actor._id,
    action: !wasCompleted && feedback.status === 'completed' ? 'feedback.submitted' : 'feedback.updated',
    entityType: 'TeacherFeedback',
    entityId: feedback._id,
    description: `${actor.fullName} ${!wasCompleted && feedback.status === 'completed' ? 'submitted' : 'updated'} student feedback`,
    ipAddress,
  });
  return feedbackResult(await findFeedback(feedback._id));
}
