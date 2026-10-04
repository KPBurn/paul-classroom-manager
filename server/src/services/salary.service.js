import { ClassSession } from '../models/ClassSession.js';
import { Classroom } from '../models/Classroom.js';
import { SalaryWithdrawal } from '../models/SalaryWithdrawal.js';
import { SystemSettings } from '../models/SystemSettings.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import {
  DEFAULT_SESSION_RATE,
  calendarTotals,
  earningsBuckets,
  earningsForSession,
  roundAmount,
  sessionRateFor,
} from '../utils/salary.js';
import { calendarKeys, withCalendarKeys } from '../utils/timezone.js';
import { searchFilter } from '../utils/search.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back a salary page looks when no period is asked for. */
const DEFAULT_PERIOD_DAYS = 90;

const idOf = (value) => String(value?._id ?? value);

/** What a class pays unless the session or the school says otherwise. */
export async function defaultSessionRate() {
  const settings = await SystemSettings.findById('system').lean();
  return sessionRateFor({ rate: settings?.defaultSessionRate }, DEFAULT_SESSION_RATE);
}

/**
 * The sessions in a period, with the teachers each one pays. A session keeps the
 * teachers it was scheduled for; sessions made before that existed fall back to
 * the classroom's teachers.
 */
async function salarySessions({ teacherIds, from, to } = {}) {
  const wanted = [...new Set((teacherIds ?? []).map(String))];
  if (!wanted.length) return [];

  const classrooms = await Classroom.find({
    $or: [{ teacher: { $in: wanted } }, { teachers: { $in: wanted } }],
  }).select('teacher teachers').lean();
  const teachersByClassroom = new Map(classrooms.map((classroom) => [
    idOf(classroom),
    [classroom.teacher, ...(classroom.teachers ?? [])].filter(Boolean).map(String),
  ]));

  const sessions = await ClassSession.find({
    $or: [
      { assignedTeachers: { $in: wanted } },
      { assignedTeachers: { $exists: false }, classroom: { $in: [...teachersByClassroom.keys()] } },
    ],
    status: { $ne: 'cancelled' },
    ...(from && { endsAt: { $gt: from } }),
    ...(to && { startsAt: { $lt: to } }),
  })
    .select('title startsAt endsAt rate timezone attendance assignedTeachers classroom')
    .populate('classroom', 'name sessionRate')
    .sort({ startsAt: 1 })
    .lean();

  return sessions.map((session) => ({
    session,
    paidTeacherIds: (session.assignedTeachers
      ? session.assignedTeachers.map(String)
      : teachersByClassroom.get(idOf(session.classroom)) ?? []
    ).filter((teacherId) => wanted.includes(teacherId)),
  }));
}

/** One class, as the salary pages show it. */
function salaryLine(session, teacherId, { teacherRate, classroomRate, defaultRate, now, timezone }) {
  return withCalendarKeys({
    id: idOf(session),
    title: session.title,
    classroom: session.classroom?.name ?? null,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    timezone: session.timezone ?? timezone,
    ...earningsForSession(session, teacherId, { teacherRate, classroomRate, defaultRate, now }),
  }, timezone, session.startsAt);
}

/** A teacher's individual rate, when an administrator has assigned one. */
async function teacherRateFor(teacher) {
  if (teacher && typeof teacher === 'object') return teacher.sessionRate ?? null;
  const found = await User.findById(teacher).select('sessionRate').lean();
  return found?.sessionRate ?? null;
}

/**
 * The classes each teacher is paid for, oldest first. A class that has not
 * started yet has not been taught, so it is left out. `teacherRates` holds the
 * individual rate assigned to each teacher, if any.
 */
function linesByTeacher(pairs, { teacherIds, teacherRates, defaultRate, now, timezone }) {
  const lines = new Map(teacherIds.map((id) => [idOf(id), []]));
  for (const { session, paidTeacherIds } of pairs) {
    if (new Date(session.startsAt) > now) continue;
    const classroomRate = session.classroom?.sessionRate ?? null;
    for (const teacherId of paidTeacherIds) {
      if (!lines.has(teacherId)) continue;
      lines.get(teacherId).push(salaryLine(session, teacherId, {
        teacherRate: teacherRates?.get(teacherId) ?? null,
        classroomRate,
        defaultRate,
        now,
        timezone,
      }));
    }
  }
  return lines;
}

/** The classes one teacher is paid for in a period. */
async function teacherLines(teacher, { defaultRate, now, timezone, from, to }) {
  const teacherId = idOf(teacher);
  const rate = defaultRate ?? await defaultSessionRate();
  const teacherRates = new Map([[teacherId, await teacherRateFor(teacher)]]);
  const pairs = await salarySessions({ teacherIds: [teacherId], from, to });
  const lines = linesByTeacher(pairs, { teacherIds: [teacherId], teacherRates, defaultRate: rate, now, timezone });
  return lines.get(teacherId) ?? [];
}

function sumWithdrawals(withdrawals) {
  const total = (status) => roundAmount(withdrawals
    .filter((withdrawal) => withdrawal.status === status)
    .reduce((sum, withdrawal) => sum + withdrawal.amount, 0));
  const withdrawn = total('approved');
  const pending = total('pending');
  return { withdrawn, pending, requested: roundAmount(withdrawn + pending) };
}

const withdrawalTotals = async (teacherId) => sumWithdrawals(
  await SalaryWithdrawal.find({ teacher: teacherId }).select('amount status').lean(),
);

/** Everything a teacher has earned so far, and what is left to take out. */
export async function teacherBalance(teacher, options = {}) {
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? 'UTC';
  const lines = await teacherLines(teacher, { ...options, now, timezone });
  const earned = roundAmount(lines.reduce((sum, line) => sum + line.amount, 0));
  const withdrawals = await withdrawalTotals(idOf(teacher));
  return {
    earned,
    withdrawn: withdrawals.withdrawn,
    pending: withdrawals.pending,
    available: roundAmount(Math.max(0, earned - withdrawals.requested)),
  };
}

const teacherResult = (teacher) => ({
  id: idOf(teacher),
  name: teacher.fullName ?? `${teacher.firstName} ${teacher.lastName}`.trim(),
  email: teacher.email,
  // The rate assigned to this teacher; null means "whatever the class pays".
  sessionRate: teacher.sessionRate ?? null,
});

/** A teacher may only read their own earnings; an administrator reads anyone's. */
async function resolveTeacher(user, teacherId) {
  if (user.role === 'teacher') {
    if (teacherId && teacherId !== idOf(user)) {
      throw new AppError(403, 'You can only view your own earnings');
    }
    return user;
  }
  if (user.role !== 'admin') {
    throw new AppError(403, 'You do not have permission to view earnings');
  }
  if (!teacherId) {
    throw new AppError(400, 'Choose a teacher whose earnings to show', { error: 'teacherId is required' });
  }
  const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });
  if (!teacher) throw new AppError(404, 'Teacher not found');
  return teacher;
}

const balanceResult = (balance) => ({
  earned: balance.earned,
  withdrawn: balance.withdrawn,
  pending: balance.pending,
  available: balance.available,
});

/** Earnings for one teacher: today, this week, this month, and class by class. */
export async function getSalarySummary(user, { teacherId, from, to, timezone = 'UTC', granularity = 'day' } = {}) {
  const teacher = await resolveTeacher(user, teacherId);
  const now = new Date();
  const defaultRate = await defaultSessionRate();
  const period = {
    from: from ?? new Date(now.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS),
    to: to ?? now,
  };
  const classes = await teacherLines(teacher, { defaultRate, now, timezone, ...period });
  const balance = await teacherBalance(teacher, { defaultRate, now, timezone });

  return {
    teacher: teacherResult(teacher),
    defaultRate,
    timezone,
    granularity,
    period,
    totals: { ...calendarTotals(classes, calendarKeys(now, timezone)), lifetime: balance.earned },
    balance: balanceResult(balance),
    buckets: earningsBuckets(classes, granularity),
    classes: [...classes].reverse(),
  };
}

/** Every teacher, with what they have earned in the period. Administrators only. */
export async function listTeacherSalaries(user, { page, limit, search, timezone = 'UTC', from, to } = {}) {
  if (user.role !== 'admin') {
    throw new AppError(403, 'Only administrators can view every teacher');
  }
  const now = new Date();
  const keys = calendarKeys(now, timezone);
  const defaultRate = await defaultSessionRate();
  const period = {
    from: from ?? new Date(now.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS),
    to: to ?? now,
  };

  const filter = { role: 'teacher', ...searchFilter(search) };
  const [teachers, total] = await Promise.all([
    User.find(filter).sort({ lastName: 1, firstName: 1, _id: 1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  const teacherIds = teachers.map(({ _id }) => _id);
  const [periodPairs, lifetimePairs, withdrawals] = await Promise.all([
    salarySessions({ teacherIds, ...period }),
    from ? salarySessions({ teacherIds }) : Promise.resolve(null),
    SalaryWithdrawal.find({ teacher: { $in: teacherIds } }).select('teacher amount status').lean(),
  ]);

  const options = {
    teacherIds,
    teacherRates: new Map(teachers.map((teacher) => [idOf(teacher), teacher.sessionRate ?? null])),
    defaultRate,
    now,
    timezone,
  };
  const periodLines = linesByTeacher(periodPairs, options);
  // What a teacher can take out is their lifetime balance, so it also counts the
  // classes that came before the period this page shows.
  const lifetimeLines = lifetimePairs ? linesByTeacher(lifetimePairs, options) : periodLines;
  const withdrawalsByTeacher = new Map(teacherIds.map((id) => [idOf(id), []]));
  for (const withdrawal of withdrawals) {
    withdrawalsByTeacher.get(idOf(withdrawal.teacher))?.push(withdrawal);
  }

  const items = teachers.map((teacher) => {
    const key = idOf(teacher);
    const classes = periodLines.get(key) ?? [];
    const earned = roundAmount((lifetimeLines.get(key) ?? [])
      .reduce((sum, line) => sum + line.amount, 0));
    const requested = sumWithdrawals(withdrawalsByTeacher.get(key) ?? []);
    return {
      teacher: teacherResult(teacher),
      totals: { ...calendarTotals(classes, keys), lifetime: earned },
      classes: classes.length,
      minutes: Math.round(classes.reduce((sum, line) => sum + line.attendedMs, 0) / 60_000),
      balance: {
        earned,
        withdrawn: requested.withdrawn,
        pending: requested.pending,
        available: roundAmount(Math.max(0, earned - requested.requested)),
      },
    };
  });

  return {
    items,
    defaultRate,
    timezone,
    period,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

function withdrawalResult(withdrawal) {
  const { teacher, reviewedBy } = withdrawal;
  return {
    id: idOf(withdrawal),
    amount: roundAmount(withdrawal.amount),
    method: withdrawal.method,
    note: withdrawal.note ?? null,
    status: withdrawal.status,
    requestedAt: withdrawal.requestedAt,
    teacher: teacher?.firstName
      ? { id: idOf(teacher), name: `${teacher.firstName} ${teacher.lastName}`.trim(), email: teacher.email }
      : undefined,
    reviewedBy: reviewedBy?.firstName
      ? { id: idOf(reviewedBy), name: `${reviewedBy.firstName} ${reviewedBy.lastName}`.trim() }
      : null,
    reviewedAt: withdrawal.reviewedAt ?? null,
    reviewNote: withdrawal.reviewNote ?? null,
  };
}

/** Teachers see their own requests; administrators see every request. */
export async function listWithdrawals(user, { teacherId, status, page, limit } = {}) {
  const filter = {};
  if (user.role === 'teacher') {
    filter.teacher = user._id;
  } else if (user.role === 'admin') {
    if (teacherId) filter.teacher = teacherId;
  } else {
    throw new AppError(403, 'You do not have permission to view withdrawals');
  }
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    SalaryWithdrawal.find(filter)
      .sort({ requestedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('teacher', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName'),
    SalaryWithdrawal.countDocuments(filter),
  ]);

  return {
    items: items.map(withdrawalResult),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function createWithdrawal(user, { amount, method, note }, { ipAddress } = {}) {
  if (user.role !== 'teacher') {
    throw new AppError(403, 'Only teachers can request a withdrawal');
  }
  const balance = await teacherBalance(user);
  if (amount > balance.available) {
    throw new AppError(400, 'That is more than is available to withdraw', {
      error: `You can withdraw up to ${balance.available} right now`,
    });
  }

  const withdrawal = await SalaryWithdrawal.create({
    teacher: user._id,
    amount: roundAmount(amount),
    method,
    note,
    status: 'pending',
  });
  await logActivity({
    actorId: user._id,
    action: 'salary.withdrawal-requested',
    entityType: 'SalaryWithdrawal',
    entityId: withdrawal._id,
    description: `${user.fullName} requested a withdrawal of ${withdrawal.amount}`,
    ipAddress,
  });

  await withdrawal.populate('teacher', 'firstName lastName email');
  return withdrawalResult(withdrawal);
}

export async function reviewWithdrawal(user, id, { status, reviewNote }, { ipAddress } = {}) {
  if (user.role !== 'admin') {
    throw new AppError(403, 'Only administrators can review withdrawals');
  }
  const withdrawal = await SalaryWithdrawal.findById(id);
  if (!withdrawal) throw new AppError(404, 'Withdrawal request not found');
  if (withdrawal.status !== 'pending') {
    throw new AppError(400, 'This request has already been reviewed');
  }

  withdrawal.status = status;
  withdrawal.reviewedBy = user._id;
  withdrawal.reviewedAt = new Date();
  withdrawal.reviewNote = reviewNote;
  await withdrawal.save();
  await withdrawal.populate('teacher', 'firstName lastName email');
  await withdrawal.populate('reviewedBy', 'firstName lastName');

  await logActivity({
    actorId: user._id,
    action: `salary.withdrawal-${status}`,
    entityType: 'SalaryWithdrawal',
    entityId: withdrawal._id,
    description: `${user.fullName} marked a withdrawal of ${withdrawal.amount} as ${status}`,
    ipAddress,
  });

  return withdrawalResult(withdrawal);
}

export async function cancelWithdrawal(user, id, { ipAddress } = {}) {
  const withdrawal = await SalaryWithdrawal.findById(id);
  if (!withdrawal) throw new AppError(404, 'Withdrawal request not found');
  if (String(withdrawal.teacher) !== idOf(user) && user.role !== 'admin') {
    throw new AppError(403, 'You can only cancel your own request');
  }
  if (withdrawal.status !== 'pending') {
    throw new AppError(400, 'Only a request that is waiting for approval can be cancelled');
  }

  await withdrawal.deleteOne();
  await logActivity({
    actorId: user._id,
    action: 'salary.withdrawal-cancelled',
    entityType: 'SalaryWithdrawal',
    entityId: withdrawal._id,
    description: `${user.fullName} cancelled a withdrawal of ${withdrawal.amount}`,
    ipAddress,
  });
}