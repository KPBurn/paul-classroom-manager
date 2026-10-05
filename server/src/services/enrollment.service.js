import { randomInt } from 'node:crypto';
import { env, isTest } from '../config/environment.js';
import { Classroom } from '../models/Classroom.js';
import { EnrollmentApplication } from '../models/EnrollmentApplication.js';
import { User } from '../models/User.js';
import { DATA_RESOURCES, publishDataChanged } from '../realtime/dataEvents.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import { signActionToken, verifyActionToken } from '../utils/jwt.js';
import { enrollStudent, unenrollStudent } from './classroom.service.js';
import { sendApplicationDecided, sendApplicationReceived, sendReferenceReminder } from './mail.service.js';
import { createUser } from './user.service.js';

const MAX_PHOTO_SIZE = 2 * 1024 * 1024;
// The same answer whether the reference number or the other detail is wrong, so neither can be guessed alone.
const NO_MATCH = 'No application matches those details. Check your reference number and try again.';
// Letters and digits that are not mistaken for each other when read aloud or copied by hand.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FORM_TOKEN = 'enrollment-form';
const FORM_TOKEN_LIFETIME = '3h';
// A person needs longer than this to fill in the form; a script that posts straight away does not.
const MIN_FILL_SECONDS = isTest ? 0 : 5;
const NOT_HUMAN = 'Your application could not be submitted. Reload the page and try again.';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idOf = (value) => String(value?._id ?? value);
const fullName = ({ firstName, lastName }) => `${firstName} ${lastName}`;

function newReferenceNumber() {
  const block = () => Array.from({ length: 4 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('');
  return `ENR-${block()}-${block()}`;
}

/** Saves a new application under a reference number nobody else has. */
async function createWithReference(fields) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await EnrollmentApplication.create({ ...fields, referenceNumber: newReferenceNumber() });
    } catch (error) {
      if (error?.code !== 11000 || attempt >= 4) throw error;
    }
  }
}

/**
 * The state of an application that names classes, from its classes that were
 * not withdrawn: pending while any is undecided, otherwise approved if at
 * least one was.
 */
function overallStatus(requests) {
  const live = requests.filter((request) => request.status !== 'withdrawn');
  if (!live.length) return 'withdrawn';
  if (live.some((request) => request.status === 'pending')) return 'pending';
  return live.some((request) => request.status === 'approved') ? 'approved' : 'rejected';
}

/** Detects JPEG, PNG and WebP from the file's first bytes; the type the browser claims is not trusted. */
function imageTypeOf(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** Tells the administrators, and the student when they have an account, to load their enrollment lists again. */
function announce(application) {
  publishDataChanged(DATA_RESOURCES.enrollment, {
    roles: ['admin'],
    userIds: application?.user ? [idOf(application.user)] : [],
  });
}

// Seats

/**
 * Seats held by applicants who were approved for a class but have not made
 * their account yet, by classroom id. They are not on the roster, but the
 * seat is theirs.
 */
async function reservedSeats(classroomIds) {
  const rows = await EnrollmentApplication.aggregate([
    { $match: { user: null, 'requests.status': 'approved', ...(classroomIds && { 'requests.classroom': { $in: classroomIds } }) } },
    { $unwind: '$requests' },
    { $match: { 'requests.status': 'approved' } },
    { $group: { _id: '$requests.classroom', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

const seatsTaken = (classroom, reserved) => (classroom.students?.length ?? 0) + (reserved.get(String(classroom._id)) ?? 0);
const isFull = (classroom, reserved) => Boolean(classroom.capacity) && seatsTaken(classroom, reserved) >= classroom.capacity;

// What is shown

const TEACHER_FIELDS = 'firstName lastName';
const CLASS_FIELDS = 'name subject schedule status teacher teachers students capacity enrollmentOpen';
const withTeachers = { path: 'teacher teachers', select: TEACHER_FIELDS };

/** A class as an applicant sees it: what it is, who teaches it, when, and whether it has room. Never who is in it. */
function classView(classroom, reserved = new Map()) {
  if (!classroom?._id) return null;
  const teachers = [classroom.teacher, ...(classroom.teachers ?? [])].filter((teacher) => teacher?._id);
  const seen = new Set();
  return {
    id: String(classroom._id),
    name: classroom.name,
    subject: classroom.subject ?? '',
    schedule: classroom.schedule
      ? { weekdays: [...classroom.schedule.weekdays], startTime: classroom.schedule.startTime, endTime: classroom.schedule.endTime }
      : null,
    archived: classroom.status === 'archived',
    open: classroom.enrollmentOpen !== false,
    capacity: classroom.capacity ?? null,
    seatsLeft: classroom.capacity ? Math.max(0, classroom.capacity - seatsTaken(classroom, reserved)) : null,
    full: isFull(classroom, reserved),
    teachers: teachers
      .filter((teacher) => !seen.has(String(teacher._id)) && seen.add(String(teacher._id)))
      .map((teacher) => ({ id: String(teacher._id), name: fullName(teacher) })),
  };
}

const requestView = (request, reserved) => ({
  id: String(request._id),
  classroom: classView(request.classroom, reserved),
  status: request.status,
  decidedAt: request.decidedAt ?? null,
});

/** What the student is shown about their own application. */
function studentView(application) {
  return {
    id: String(application._id),
    referenceNumber: application.referenceNumber,
    status: application.status,
    firstName: application.student.firstName,
    requests: application.requests.map((request) => requestView(request)),
    adminNote: application.adminNote,
    accountCreated: Boolean(application.user),
    submittedAt: application.createdAt,
  };
}

/** Everything the administrator needs to decide. `account` is the matching account, if the email has one. */
function adminView(application, account, reserved) {
  const { user } = application;
  const linked = user?._id ? user : account;
  const { student, guardian } = application.toObject();
  return {
    id: String(application._id),
    referenceNumber: application.referenceNumber,
    kind: application.kind,
    status: application.status,
    student,
    guardian,
    note: application.note,
    adminNote: application.adminNote,
    hasPhoto: Boolean(application.photo?.size),
    requests: application.requests.map((request) => requestView(request, reserved)),
    account: linked ? { id: String(linked._id), name: fullName(linked), role: linked.role, linked: Boolean(user) } : null,
    submittedAt: application.createdAt,
  };
}

const populated = (query) => query
  .populate({ path: 'requests.classroom', select: CLASS_FIELDS, populate: withTeachers })
  .populate('user', 'firstName lastName role');

// Choosing classes

/**
 * The classes that can be applied for: active classrooms an administrator left
 * open for enrollment. The form token that comes with them has to be sent back
 * with an application (see assertHuman).
 */
export async function listOpenClasses() {
  const [classrooms, reserved] = await Promise.all([
    Classroom.find({ status: 'active', enrollmentOpen: { $ne: false } })
      .select(CLASS_FIELDS)
      .sort({ subject: 1, name: 1 })
      .populate(withTeachers),
    reservedSeats(),
  ]);
  return {
    items: classrooms.map((classroom) => classView(classroom, reserved)),
    formToken: signActionToken(FORM_TOKEN, 'form', {}, FORM_TOKEN_LIFETIME),
  };
}

/** The chosen classes, which all have to be open for enrollment and have room. */
async function requestableClassrooms(ids) {
  if (!ids.length) return [];
  const [classrooms, reserved] = await Promise.all([
    Classroom.find({ _id: { $in: ids }, status: 'active', enrollmentOpen: { $ne: false } }),
    reservedSeats(),
  ]);
  if (classrooms.length !== ids.length) {
    throw new AppError(400, 'One of the classes you chose is no longer open. Refresh the list and choose again.');
  }
  const full = classrooms.find((classroom) => isFull(classroom, reserved));
  if (full) throw new AppError(409, `"${full.name}" is full. Choose another class.`);
  return classrooms;
}

// Applying without an account

/**
 * Keeps scripts from flooding the school with applications, without asking
 * people to solve anything: a field people cannot see must stay empty, and the
 * form must have been open for a few seconds before it is sent.
 */
function assertHuman({ website, formToken }) {
  const form = verifyActionToken(FORM_TOKEN, formToken ?? '');
  if (website || !form || Date.now() / 1000 - form.iat < MIN_FILL_SECONDS) throw new AppError(400, NOT_HUMAN);
}

export async function submitApplication({ website, formToken, ...data }, { ipAddress } = {}) {
  assertHuman({ website, formToken });
  const classrooms = await requestableClassrooms(data.classroomIds);
  const { email } = data.student;
  // One open application per person: a second would only make the administrator decide twice.
  if (await EnrollmentApplication.exists({
    kind: 'applicant', 'student.email': email, user: null, status: { $in: ['pending', 'approved'] },
  })) {
    throw new AppError(409, 'An application with this email is already on file. Check its status with your reference number.');
  }

  const application = await createWithReference({
    kind: 'applicant',
    student: data.student,
    guardian: data.guardian,
    note: data.note,
    requests: classrooms.map(({ _id }) => ({ classroom: _id })),
    agreedAt: new Date(),
  });
  await logActivity({
    action: 'enrollment.submitted',
    entityType: 'EnrollmentApplication',
    entityId: application._id,
    description: `${fullName(application.student)} applied for ${classrooms.map(({ name }) => `"${name}"`).join(', ') || 'enrollment'}`,
    ipAddress,
  });
  void sendApplicationReceived({
    to: email,
    firstName: application.student.firstName,
    referenceNumber: application.referenceNumber,
  });
  announce(application);
  return { referenceNumber: application.referenceNumber, status: application.status };
}

/**
 * Adds the optional 2x2 photo to an application that is still waiting. The
 * reference number is the only proof asked for: it was just shown to whoever
 * submitted the form and cannot be guessed.
 */
export async function attachPhoto(referenceNumber, data) {
  if (!Buffer.isBuffer(data) || data.length === 0) throw new AppError(400, 'Choose a photo to upload');
  if (data.length > MAX_PHOTO_SIZE) throw new AppError(413, 'Photos must be 2 MB or smaller');
  const contentType = imageTypeOf(data);
  if (!contentType) throw new AppError(400, 'The photo must be a JPEG, PNG or WebP image');

  const { matchedCount } = await EnrollmentApplication.updateOne(
    { referenceNumber, kind: 'applicant', status: 'pending', user: null },
    { $set: { photo: { data, contentType, size: data.length } } },
  );
  if (!matchedCount) throw new AppError(404, NO_MATCH);
  announce();
}

/**
 * Emails the reference numbers of the applications made with an email address,
 * for someone who lost theirs. Nothing in the answer says whether there are any.
 */
export async function remindReference(email) {
  const applications = await EnrollmentApplication
    .find({ kind: 'applicant', 'student.email': email, status: { $ne: 'withdrawn' } })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('referenceNumber student.firstName');
  if (!applications.length) return;
  void sendReferenceReminder({
    to: email,
    firstName: applications[0].student.firstName,
    referenceNumbers: applications.map(({ referenceNumber }) => referenceNumber),
  });
}

async function applicationFor({ referenceNumber, birthday, email }) {
  const application = await populated(EnrollmentApplication.findOne({ referenceNumber, kind: 'applicant' }));
  const matches = application
    && application.student.birthday === birthday
    && (email === undefined || application.student.email === email);
  if (!matches) throw new AppError(404, NO_MATCH);
  return application;
}

export async function checkStatus(details) {
  return studentView(await applicationFor(details));
}

/**
 * Lets an approved applicant make their own account. They prove who they are
 * with the reference number, the birthday and the email on the application; the
 * account is then put into the classes that were approved.
 */
export async function createAccount({ referenceNumber, birthday, email, password }, { ipAddress } = {}) {
  const application = await applicationFor({ referenceNumber, birthday, email });
  if (application.user) throw new AppError(409, 'This application already has an account. Sign in instead.');
  if (application.status !== 'approved') {
    throw new AppError(409, application.status === 'pending'
      ? 'Your application is still being reviewed. You can create your account once it is approved.'
      : 'This application was not approved, so an account cannot be created for it.');
  }

  const user = await createUser({
    firstName: application.student.firstName,
    lastName: application.student.lastName,
    email,
    password,
    role: 'student',
    status: 'active',
  }, { ipAddress });
  application.user = user._id;
  await application.save();
  await enrollApproved(application);
  publishDataChanged(DATA_RESOURCES.users, { roles: ['admin'] });
  announce(application);
  return { email: user.email };
}

/** Puts the application's account into every class that was approved. */
async function enrollApproved(application) {
  const approved = application.requests
    .filter((request) => request.status === 'approved')
    .map((request) => idOf(request.classroom));
  if (application.user && approved.length) await enrollStudent(idOf(application.user), approved);
}

// Asking for a class from an account

export async function requestClasses(user, { classroomIds, note }, { ipAddress } = {}) {
  const classrooms = await requestableClassrooms(classroomIds);
  const enrolledIn = classrooms.find((classroom) => classroom.students.some((student) => idOf(student) === user.id));
  if (enrolledIn) throw new AppError(409, `You are already in "${enrolledIn.name}".`);
  const waiting = await EnrollmentApplication.findOne({
    user: user._id,
    requests: { $elemMatch: { classroom: { $in: classroomIds }, status: 'pending' } },
  }).populate('requests.classroom', 'name');
  if (waiting) {
    const { classroom } = waiting.requests.find((request) => request.status === 'pending' && classroomIds.includes(idOf(request.classroom)));
    throw new AppError(409, `You have already asked to join "${classroom.name}". It is waiting for a decision.`);
  }

  const application = await createWithReference({
    kind: 'student',
    student: { firstName: user.firstName, lastName: user.lastName, email: user.email },
    note,
    requests: classrooms.map(({ _id }) => ({ classroom: _id })),
    user: user._id,
  });
  await logActivity({
    actorId: user._id,
    action: 'enrollment.requested',
    entityType: 'EnrollmentApplication',
    entityId: application._id,
    description: `${user.fullName} asked to join ${classrooms.map(({ name }) => `"${name}"`).join(', ')}`,
    ipAddress,
  });
  announce(application);
  return studentView(await populated(EnrollmentApplication.findById(application._id)));
}

export async function listOwnRequests(user) {
  const applications = await populated(EnrollmentApplication.find({ user: user._id }).sort({ createdAt: -1 }).limit(50));
  return applications.map(studentView);
}

/** Lets a student take back a class request that has not been decided. */
export async function withdrawRequest(user, id, requestId, { ipAddress } = {}) {
  const application = await populated(EnrollmentApplication.findOne({ _id: id, user: user._id }));
  const request = application?.requests.id(requestId);
  if (!request) throw new AppError(404, 'Class request not found');
  if (request.status !== 'pending') throw new AppError(409, 'This request has already been decided, so it cannot be withdrawn.');

  request.status = 'withdrawn';
  request.decidedAt = new Date();
  application.status = overallStatus(application.requests);
  await application.save();
  await logActivity({
    actorId: user._id,
    action: 'enrollment.withdrawn',
    entityType: 'EnrollmentApplication',
    entityId: application._id,
    description: `${user.fullName} withdrew their request to join "${request.classroom?.name ?? 'a class'}"`,
    ipAddress,
  });
  announce(application);
  return studentView(application);
}

// The student's record

/** The details a student gave when they applied, kept with their account. */
const ownApplication = (userId) => EnrollmentApplication.findOne({ user: userId, kind: 'applicant' }).sort({ createdAt: -1 });

export async function getOwnRecord(user) {
  const application = await ownApplication(user._id);
  if (!application) return null;
  const { student, guardian } = application.toObject();
  return {
    referenceNumber: application.referenceNumber,
    student,
    guardian,
    hasPhoto: Boolean(application.photo?.size),
    submittedAt: application.createdAt,
  };
}

export async function getOwnPhoto(user) {
  const application = await ownApplication(user._id).select('+photo.data');
  if (!application?.photo?.data?.length) throw new AppError(404, 'There is no photo on your record');
  return application.photo;
}

/** The same record for an administrator looking at a student's account; `null` for accounts they made by hand. */
export async function getRecordOf(userId) {
  const application = await populated(ownApplication(userId));
  return application ? adminView(application, null, new Map()) : null;
}

// Reviewing

/** Accounts that already use an application's email, so a returning student is recognised. */
async function accountsByEmail(applications) {
  const emails = applications.filter((application) => !application.user).map((application) => application.student.email);
  const users = emails.length ? await User.find({ email: { $in: emails } }).select('firstName lastName email role') : [];
  return new Map(users.map((user) => [user.email, user]));
}

export async function listApplications({ page, limit, search, status, classroomId }) {
  const filter = {
    ...(status && { status }),
    ...(classroomId && { 'requests.classroom': classroomId }),
    ...(search && {
      $and: search.split(/\s+/).map((word) => {
        const pattern = new RegExp(escapeRegex(word), 'i');
        return {
          $or: [
            { 'student.firstName': pattern },
            { 'student.lastName': pattern },
            { 'student.email': pattern },
            { referenceNumber: pattern },
          ],
        };
      }),
    }),
  };
  const [applications, total, pendingCount, reserved] = await Promise.all([
    // The waiting list is read oldest first, so nobody is left waiting longest; anything else newest first.
    populated(EnrollmentApplication.find(filter)
      .sort({ createdAt: status === 'pending' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)),
    EnrollmentApplication.countDocuments(filter),
    EnrollmentApplication.countDocuments({ status: 'pending' }),
    reservedSeats(),
  ]);
  const accounts = await accountsByEmail(applications);
  return {
    items: applications.map((application) => adminView(application, accounts.get(application.student.email), reserved)),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    pendingCount,
  };
}

async function findApplicationOrThrow(id) {
  const application = await populated(EnrollmentApplication.findById(id));
  if (!application) throw new AppError(404, 'Application not found');
  return application;
}

export async function getApplication(id) {
  const application = await findApplicationOrThrow(id);
  const [accounts, reserved] = await Promise.all([accountsByEmail([application]), reservedSeats()]);
  return adminView(application, accounts.get(application.student.email), reserved);
}

export async function getPhoto(id) {
  const application = await EnrollmentApplication.findById(id).select('+photo.data');
  if (!application?.photo?.data?.length) throw new AppError(404, 'This application has no photo');
  return application.photo;
}

/** An applicant whose email already has a student account is a returning student: approval uses that account. */
async function linkExistingAccount(application) {
  if (application.user) return;
  const account = await User.findOne({ email: application.student.email });
  if (account && account.role !== 'student') {
    throw new AppError(409, `${application.student.email} belongs to a ${account.role} account, so this applicant cannot be enrolled with it.`);
  }
  if (account) application.user = account._id;
}

/**
 * Finishes a decision: tells the pages that show it, and emails the student
 * once nothing on the application is waiting any more, so they get one email
 * for the whole application rather than one for each class.
 */
async function decided(id, wasPending) {
  const view = await getApplication(id);
  announce({ user: view.account?.linked ? view.account.id : null });
  if (wasPending && view.status !== 'pending') {
    void sendApplicationDecided({
      to: view.student.email,
      firstName: view.student.firstName,
      referenceNumber: view.referenceNumber,
      status: view.status,
      classes: view.requests
        .filter((request) => request.status !== 'withdrawn')
        .map((request) => ({ subject: request.classroom?.subject, name: request.classroom?.name ?? 'Class', status: request.status })),
      adminNote: view.adminNote,
      hasAccount: Boolean(view.account?.linked),
    });
  }
  return view;
}

/**
 * Approves or rejects an applicant who has not chosen a class. Once approved
 * they create their account and ask for their classes from inside the portal.
 */
export async function decideApplication(id, { status, adminNote }, { actor, ipAddress }) {
  const application = await findApplicationOrThrow(id);
  if (application.requests.length) {
    throw new AppError(409, 'This application names its classes. Decide each class instead.');
  }
  if (application.status !== 'pending') throw new AppError(409, 'This application has already been decided.');

  if (status === 'approved') await linkExistingAccount(application);
  application.status = status;
  if (adminNote !== undefined) application.adminNote = adminNote;
  await application.save();
  await logActivity({
    actorId: actor._id,
    action: `enrollment.${status}`,
    entityType: 'EnrollmentApplication',
    entityId: application._id,
    description: `${actor.fullName} ${status} the enrollment of ${fullName(application.student)}`,
    ipAddress,
  });
  return decided(id, true);
}

/**
 * Approves or rejects one class of an application. Approving can place the
 * student in a different class than the one asked for. A student who already
 * has an account joins the class at once; an applicant joins when they create
 * their account.
 */
export async function decideRequest(id, requestId, { status, classroomId, adminNote }, { actor, ipAddress }) {
  const application = await findApplicationOrThrow(id);
  const request = application.requests.id(requestId);
  if (!request) throw new AppError(404, 'Class request not found');
  if (request.status !== 'pending') throw new AppError(409, 'This class request has already been decided.');

  let classroom = request.classroom;
  if (status === 'approved') {
    const targetId = classroomId ?? idOf(request.classroom);
    classroom = await Classroom.findById(targetId);
    if (!classroom || classroom.status !== 'active') {
      throw new AppError(400, 'Choose an active class to approve the student into.');
    }
    if (application.requests.some((other) => other !== request && other.status !== 'withdrawn' && idOf(other.classroom) === targetId)) {
      throw new AppError(409, `This application already has a request for "${classroom.name}".`);
    }
    await linkExistingAccount(application);
    const alreadyIn = application.user && classroom.students.some((student) => idOf(student) === idOf(application.user));
    if (!alreadyIn && isFull(classroom, await reservedSeats([classroom._id]))) {
      throw new AppError(409, `"${classroom.name}" is full (${classroom.capacity} of ${classroom.capacity}). Raise its capacity or choose another class.`);
    }
    request.classroom = classroom._id;
  }
  request.status = status;
  request.decidedAt = new Date();
  request.decidedBy = actor._id;
  if (adminNote !== undefined) application.adminNote = adminNote;
  application.status = overallStatus(application.requests);
  await application.save();

  if (status === 'approved') await enrollApproved(application);
  await logActivity({
    actorId: actor._id,
    action: `enrollment.${status}`,
    entityType: 'EnrollmentApplication',
    entityId: application._id,
    description: `${actor.fullName} ${status} ${fullName(application.student)} for "${classroom?.name ?? 'a class'}"`,
    ipAddress,
  });
  return decided(id, true);
}

/**
 * Undoes a decision, so it can be made again. A student who had already
 * joined the class is taken out of it and its unfinished sessions.
 */
export async function reopenRequest(id, requestId, { actor, ipAddress }) {
  const application = await findApplicationOrThrow(id);
  const request = application.requests.id(requestId);
  if (!request) throw new AppError(404, 'Class request not found');
  if (!['approved', 'rejected'].includes(request.status)) {
    throw new AppError(409, request.status === 'pending' ? 'This class request is still waiting for a decision.' : 'The student withdrew this request.');
  }

  if (request.status === 'approved' && application.user) {
    await unenrollStudent(idOf(application.user), idOf(request.classroom));
  }
  request.status = 'pending';
  request.decidedAt = undefined;
  request.decidedBy = undefined;
  application.status = overallStatus(application.requests);
  await application.save();
  await logActivity({
    actorId: actor._id,
    action: 'enrollment.reopened',
    entityType: 'EnrollmentApplication',
    entityId: application._id,
    description: `${actor.fullName} reopened the decision on ${fullName(application.student)} for "${request.classroom?.name ?? 'a class'}"`,
    ipAddress,
  });
  return decided(id, false);
}

/** Undoes the decision on an applicant who chose no class, unless they have made their account since. */
export async function reopenApplication(id, { actor, ipAddress }) {
  const application = await findApplicationOrThrow(id);
  if (application.requests.length) throw new AppError(409, 'This application names its classes. Reopen the class instead.');
  if (application.status === 'pending') throw new AppError(409, 'This application is still waiting for a decision.');
  if (application.user) {
    throw new AppError(409, 'This student already has an account, so the approval cannot be undone here. Set the account to Inactive from Students instead.');
  }

  application.status = 'pending';
  await application.save();
  await logActivity({
    actorId: actor._id,
    action: 'enrollment.reopened',
    entityType: 'EnrollmentApplication',
    entityId: application._id,
    description: `${actor.fullName} reopened the enrollment of ${fullName(application.student)}`,
    ipAddress,
  });
  return decided(id, false);
}

// Keeping only what is needed

/**
 * Deletes applications that were not approved, or were withdrawn, once they
 * are older than ENROLLMENT_RETENTION_DAYS. Does nothing when that is not set.
 */
export async function purgeExpiredApplications(now = new Date()) {
  if (!(env.enrollmentRetentionDays > 0)) return 0;
  const before = new Date(now.getTime() - env.enrollmentRetentionDays * 24 * 60 * 60 * 1000);
  const { deletedCount } = await EnrollmentApplication.deleteMany({
    status: { $in: ['rejected', 'withdrawn'] },
    updatedAt: { $lt: before },
  });
  if (deletedCount) console.log(`Removed ${deletedCount} enrollment application(s) older than ${env.enrollmentRetentionDays} days`);
  return deletedCount;
}
