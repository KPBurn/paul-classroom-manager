import { randomInt } from 'node:crypto';
import { Classroom } from '../models/Classroom.js';
import { EnrollmentApplication } from '../models/EnrollmentApplication.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';
import { enrollStudent } from './classroom.service.js';
import { createUser } from './user.service.js';

const MAX_PHOTO_SIZE = 2 * 1024 * 1024;
// The same answer whether the reference number or the other detail is wrong, so neither can be guessed alone.
const NO_MATCH = 'No application matches those details. Check your reference number and try again.';
// Letters and digits that are not mistaken for each other when read aloud or copied by hand.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

/** Pending while any class is undecided; otherwise approved if at least one class was. */
function overallStatus(requests) {
  if (requests.some((request) => request.status === 'pending')) return 'pending';
  return requests.some((request) => request.status === 'approved') ? 'approved' : 'rejected';
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

// What is shown

const TEACHER_FIELDS = 'firstName lastName';
const CLASS_FIELDS = 'name subject schedule status teacher teachers';
const withTeachers = { path: 'teacher teachers', select: TEACHER_FIELDS };

/** A class as an applicant sees it: what it is, who teaches it and when. Never who is in it. */
function classView(classroom) {
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
    teachers: teachers
      .filter((teacher) => !seen.has(String(teacher._id)) && seen.add(String(teacher._id)))
      .map((teacher) => ({ id: String(teacher._id), name: fullName(teacher) })),
  };
}

const requestView = (request) => ({
  id: String(request._id),
  classroom: classView(request.classroom),
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
    requests: application.requests.map(requestView),
    adminNote: application.adminNote,
    accountCreated: Boolean(application.user),
    submittedAt: application.createdAt,
  };
}

/** Everything the administrator needs to decide. `account` is the matching account, if the email has one. */
function adminView(application, account) {
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
    requests: application.requests.map(requestView),
    account: linked ? { id: String(linked._id), name: fullName(linked), role: linked.role, linked: Boolean(user) } : null,
    submittedAt: application.createdAt,
  };
}

const populated = (query) => query
  .populate({ path: 'requests.classroom', select: CLASS_FIELDS, populate: withTeachers })
  .populate('user', 'firstName lastName role');

// Choosing classes

/** The classes that can be applied for: every active classroom, which an administrator created with its teacher. */
export async function listOpenClasses() {
  const classrooms = await Classroom.find({ status: 'active' })
    .select(CLASS_FIELDS)
    .sort({ subject: 1, name: 1 })
    .populate(withTeachers);
  return classrooms.map(classView);
}

async function activeClassrooms(ids) {
  const classrooms = await Classroom.find({ _id: { $in: ids }, status: 'active' });
  if (classrooms.length !== ids.length) {
    throw new AppError(400, 'One of the classes you chose is no longer open. Refresh the list and choose again.');
  }
  return classrooms;
}

// Applying without an account

export async function submitApplication(data, { ipAddress } = {}) {
  const classrooms = await activeClassrooms(data.classroomIds);
  const { email } = data.student;
  // One open application per person: a second would only make the administrator decide twice.
  if (await EnrollmentApplication.exists({ kind: 'applicant', 'student.email': email, user: null, status: { $ne: 'rejected' } })) {
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
    description: `${fullName(application.student)} applied for ${classrooms.map(({ name }) => `"${name}"`).join(', ')}`,
    ipAddress,
  });
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
  return { email: user.email };
}

/** Puts the application's account into every class that was approved. */
async function enrollApproved(application) {
  const approved = application.requests
    .filter((request) => request.status === 'approved')
    .map((request) => idOf(request.classroom));
  if (application.user && approved.length) await enrollStudent(idOf(application.user), approved);
}

// Asking for another class from an account

export async function requestClasses(user, { classroomIds, note }, { ipAddress } = {}) {
  const classrooms = await activeClassrooms(classroomIds);
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
  return studentView(await populated(EnrollmentApplication.findById(application._id)));
}

export async function listOwnRequests(user) {
  const applications = await populated(EnrollmentApplication.find({ user: user._id }).sort({ createdAt: -1 }).limit(50));
  return applications.map(studentView);
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
  const [applications, total, pendingCount] = await Promise.all([
    // The waiting list is read oldest first, so nobody is left waiting longest; anything else newest first.
    populated(EnrollmentApplication.find(filter)
      .sort({ createdAt: status === 'pending' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)),
    EnrollmentApplication.countDocuments(filter),
    EnrollmentApplication.countDocuments({ status: 'pending' }),
  ]);
  const accounts = await accountsByEmail(applications);
  return {
    items: applications.map((application) => adminView(application, accounts.get(application.student.email))),
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
  return adminView(application, (await accountsByEmail([application])).get(application.student.email));
}

export async function getPhoto(id) {
  const application = await EnrollmentApplication.findById(id).select('+photo.data');
  if (!application?.photo?.data?.length) throw new AppError(404, 'This application has no photo');
  return application.photo;
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
    if (application.requests.some((other) => other !== request && idOf(other.classroom) === targetId)) {
      throw new AppError(409, `This application already has a request for "${classroom.name}".`);
    }
    // An applicant whose email already has a student account is a returning student: use that account.
    if (!application.user) {
      const account = await User.findOne({ email: application.student.email });
      if (account && account.role !== 'student') {
        throw new AppError(409, `${application.student.email} belongs to a ${account.role} account, so this applicant cannot be enrolled with it.`);
      }
      if (account) application.user = account._id;
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
  return getApplication(id);
}
