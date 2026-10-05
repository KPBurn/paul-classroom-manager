import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createUser, clearDatabase, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';
import { Classroom } from '../src/models/Classroom.js';
import { ClassSession } from '../src/models/ClassSession.js';
import { EnrollmentApplication } from '../src/models/EnrollmentApplication.js';
import { User } from '../src/models/User.js';
import { testOutbox } from '../src/services/mail.service.js';

const app = createApp();
const login = async (user, password = TEST_PASSWORD) => {
  const response = await request(app).post('/api/auth/login').send({ email: user.email, password });
  assert.equal(response.status, 200);
  return response.body.data.token;
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** Submits the public form the way the page does: with the token the class list came with. */
async function apply(body) {
  const classes = await request(app).get('/api/enrollment/classes');
  return request(app).post('/api/enrollment/applications').send({ formToken: classes.body.data.formToken, ...body });
}

const MONDAY_MORNING = { weekday: 1, startTime: '08:00', endTime: '12:00' };
const applicationFor = (classroomIds, overrides = {}) => ({
  student: {
    firstName: 'Ana',
    lastName: 'Reyes',
    email: 'ana@example.com',
    birthday: '2012-03-04',
    contactNumber: '0917 123 4567',
    ...overrides.student,
  },
  guardian: { name: 'Maria Reyes', relationship: 'Mother', contactNumber: '0917 765 4321' },
  classroomIds,
  agreed: true,
});

before(startDatabase);
after(stopDatabase);
beforeEach(clearDatabase);

describe('teacher availability and class schedules', () => {
  it('lets a teacher set availability and only schedules a class inside it', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const adminToken = await login(admin);
    const teacherToken = await login(teacher);
    const classroom = { name: 'ClassEng1', subject: 'English', teacherId: teacher.id };
    const schedule = { weekdays: [1], startTime: '09:00', endTime: '10:00' };

    const noAvailability = await request(app).post('/api/classrooms').set(auth(adminToken)).send({ ...classroom, schedule });
    assert.equal(noAvailability.status, 400);
    assert.match(noAvailability.body.message, /not available on Monday/);

    const saved = await request(app).put('/api/auth/availability').set(auth(teacherToken)).send({ availability: [MONDAY_MORNING] });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.data.user.availability, [MONDAY_MORNING]);
    const backwards = await request(app)
      .put('/api/auth/availability')
      .set(auth(teacherToken))
      .send({ availability: [{ weekday: 1, startTime: '12:00', endTime: '08:00' }] });
    assert.equal(backwards.status, 400);

    const created = await request(app).post('/api/classrooms').set(auth(adminToken)).send({ ...classroom, schedule });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.classroom.subject, 'English');
    assert.deepEqual(created.body.data.classroom.schedule, schedule);

    const tooLate = await request(app)
      .patch(`/api/classrooms/${created.body.data.classroom.id}`)
      .set(auth(adminToken))
      .send({ schedule: { weekdays: [1, 2], startTime: '11:00', endTime: '13:00' } });
    assert.equal(tooLate.status, 400);

    const cleared = await request(app)
      .patch(`/api/classrooms/${created.body.data.classroom.id}`)
      .set(auth(adminToken))
      .send({ schedule: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.classroom.schedule, null);
  });

  it('lets an administrator set a teacher’s availability, but not a student’s', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const adminToken = await login(admin);

    const updated = await request(app).patch(`/api/users/${teacher.id}`).set(auth(adminToken)).send({ availability: [MONDAY_MORNING] });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.data.user.availability, [MONDAY_MORNING]);

    const refused = await request(app).patch(`/api/users/${student.id}`).set(auth(adminToken)).send({ availability: [MONDAY_MORNING] });
    assert.equal(refused.status, 400);
    const studentToken = await login(student);
    const forbidden = await request(app).put('/api/auth/availability').set(auth(studentToken)).send({ availability: [] });
    assert.equal(forbidden.status, 403);
  });
});

describe('scheduling a class', () => {
  it('books the sessions of a new class and refuses to double-book its teacher', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher', availability: [MONDAY_MORNING] });
    const adminToken = await login(admin);
    const start = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 22 * 86_400_000).toISOString().slice(0, 10);

    const created = await request(app).post('/api/classrooms').set(auth(adminToken)).send({
      name: 'ClassEng1',
      subject: 'English',
      teacherId: teacher.id,
      schedule: { weekdays: [1], startTime: '09:00', endTime: '10:00' },
      sessions: { startDate: start, endDate: end, timezone: 'UTC' },
      capacity: 20,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.classroom.capacity, 20);
    const sessions = await ClassSession.find({ classroom: created.body.data.classroom.id });
    assert.equal(sessions.length, 3);
    assert.ok(sessions.every((session) => session.title === 'ClassEng1' && session.seriesId));

    const clash = await request(app).post('/api/classrooms').set(auth(adminToken)).send({
      name: 'ClassEng2',
      teacherId: teacher.id,
      schedule: { weekdays: [1], startTime: '09:30', endTime: '10:30' },
    });
    assert.equal(clash.status, 409);
    assert.match(clash.body.message, /already teaches "ClassEng1"/);
    const after = await request(app).post('/api/classrooms').set(auth(adminToken)).send({
      name: 'ClassEng2',
      teacherId: teacher.id,
      schedule: { weekdays: [1], startTime: '10:00', endTime: '11:00' },
    });
    assert.equal(after.status, 201);

    // Availability cannot shrink under a class that is already scheduled.
    const shrunk = await request(app)
      .patch(`/api/users/${teacher.id}`)
      .set(auth(adminToken))
      .send({ availability: [{ weekday: 1, startTime: '10:00', endTime: '12:00' }] });
    assert.equal(shrunk.status, 409);
    assert.match(shrunk.body.message, /"ClassEng1" is scheduled outside these times/);
  });
});

describe('forgotten passwords', () => {
  it('emails a link that sets a new password once', async () => {
    const user = await createUser({ role: 'student' });
    testOutbox.length = 0;

    const asked = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    assert.equal(asked.status, 200);
    assert.deepEqual(unknown.body, asked.body);
    assert.equal(testOutbox.length, 1);
    const [, token] = testOutbox[0].text.match(/token=(\S+)/);

    // The link is not a way to sign in.
    const asSession = await request(app).get('/api/auth/me').set(auth(token));
    assert.equal(asSession.status, 401);

    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'Brandnew123' });
    assert.equal(reset.status, 200);
    await login(user, 'Brandnew123');
    const reused = await request(app).post('/api/auth/reset-password').send({ token, password: 'Another123' });
    assert.equal(reused.status, 400);
  });
});

describe('enrollment applications', () => {
  let admin;
  let adminToken;
  let english;
  let math;

  beforeEach(async () => {
    admin = await createUser({ role: 'admin' });
    adminToken = await login(admin);
    const teacher = await createUser({ role: 'teacher', firstName: 'Tess', lastName: 'Cruz', availability: [MONDAY_MORNING] });
    english = await Classroom.create({
      name: 'ClassEng1',
      subject: 'English',
      teacher: teacher._id,
      teachers: [teacher._id],
      schedule: { weekdays: [1], startTime: '09:00', endTime: '10:00' },
    });
    math = await Classroom.create({ name: 'ClassMath1', subject: 'Math', teacher: teacher._id, teachers: [teacher._id] });
    await Classroom.create({ name: 'Old class', teacher: teacher._id, teachers: [teacher._id], status: 'archived' });
  });

  it('shows the open classes to anyone, without rosters', async () => {
    const student = await createUser({ role: 'student' });
    english.students = [student._id];
    await english.save();

    const response = await request(app).get('/api/enrollment/classes');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.items.map((item) => item.name), ['ClassEng1', 'ClassMath1']);
    const [first] = response.body.data.items;
    assert.equal(first.subject, 'English');
    assert.deepEqual(first.schedule, { weekdays: [1], startTime: '09:00', endTime: '10:00' });
    assert.deepEqual(first.teachers.map((teacher) => teacher.name), ['Tess Cruz']);
    assert.equal(first.students, undefined);
  });

  it('takes an application through approval, account creation and enrollment', async () => {
    const upcoming = await ClassSession.create({
      classroom: english._id,
      assignedTeachers: [english.teacher],
      assignedStudents: [],
      title: 'Lesson 1',
      startsAt: new Date(Date.now() + 3_600_000),
      endsAt: new Date(Date.now() + 7_200_000),
    });

    const invalid = await apply({ ...applicationFor([english.id]), agreed: false });
    assert.equal(invalid.status, 400);

    const submitted = await apply(applicationFor([english.id, math.id]));
    assert.equal(submitted.status, 201);
    const { referenceNumber } = submitted.body.data.application;
    assert.match(referenceNumber, /^ENR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(submitted.body.data.application.status, 'pending');

    const duplicate = await apply(applicationFor([english.id]));
    assert.equal(duplicate.status, 409);

    // The applicant checks the status with the reference number and birthday.
    const wrongBirthday = await request(app).post('/api/enrollment/status').send({ referenceNumber, birthday: '2012-03-05' });
    assert.equal(wrongBirthday.status, 404);
    const pending = await request(app).post('/api/enrollment/status').send({ referenceNumber, birthday: '2012-03-04' });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.data.application.status, 'pending');
    assert.deepEqual(pending.body.data.application.requests.map((item) => item.classroom.name).sort(), ['ClassEng1', 'ClassMath1']);

    const credentials = { referenceNumber, birthday: '2012-03-04', email: 'ana@example.com', password: 'Welcome123' };
    const tooEarly = await request(app).post('/api/enrollment/account').send(credentials);
    assert.equal(tooEarly.status, 409);

    // The administrator sees the request and which class it is for.
    const unauthenticated = await request(app).get('/api/enrollment/applications');
    assert.equal(unauthenticated.status, 401);
    const list = await request(app).get('/api/enrollment/applications?status=pending').set(auth(adminToken));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.pendingCount, 1);
    const [item] = list.body.data.items;
    assert.equal(item.student.firstName, 'Ana');
    assert.equal(item.guardian.name, 'Maria Reyes');
    assert.equal(item.account, null);
    const byClass = Object.fromEntries(item.requests.map((entry) => [entry.classroom.name, entry.id]));

    const approved = await request(app)
      .patch(`/api/enrollment/applications/${item.id}/requests/${byClass.ClassEng1}`)
      .set(auth(adminToken))
      .send({ status: 'approved' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.application.status, 'pending');
    const rejected = await request(app)
      .patch(`/api/enrollment/applications/${item.id}/requests/${byClass.ClassMath1}`)
      .set(auth(adminToken))
      .send({ status: 'rejected', adminNote: 'The Math class is full.' });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.data.application.status, 'approved');
    const again = await request(app)
      .patch(`/api/enrollment/applications/${item.id}/requests/${byClass.ClassMath1}`)
      .set(auth(adminToken))
      .send({ status: 'approved' });
    assert.equal(again.status, 409);

    // Nobody is enrolled until the applicant has an account.
    assert.equal((await Classroom.findById(english.id)).students.length, 0);

    const wrongEmail = await request(app).post('/api/enrollment/account').send({ ...credentials, email: 'someone@example.com' });
    assert.equal(wrongEmail.status, 404);
    const account = await request(app).post('/api/enrollment/account').send(credentials);
    assert.equal(account.status, 201);
    const twice = await request(app).post('/api/enrollment/account').send(credentials);
    assert.equal(twice.status, 409);

    const student = await User.findOne({ email: 'ana@example.com' });
    assert.equal(student.role, 'student');
    assert.deepEqual((await Classroom.findById(english.id)).students.map(String), [student.id]);
    assert.equal((await Classroom.findById(math.id)).students.length, 0);
    assert.deepEqual((await ClassSession.findById(upcoming.id)).assignedStudents.map(String), [student.id]);

    const studentToken = await login(student, 'Welcome123');
    const classrooms = await request(app).get('/api/classrooms').set(auth(studentToken));
    assert.deepEqual(classrooms.body.data.items.map((classroom) => classroom.name), ['ClassEng1']);
    const status = await request(app).post('/api/enrollment/status').send({ referenceNumber, birthday: '2012-03-04' });
    assert.equal(status.body.data.application.accountCreated, true);
    assert.equal(status.body.data.application.adminNote, 'The Math class is full.');
  });

  it('approves an applicant who chose no class, who then picks classes from their account', async () => {
    const submitted = await apply(applicationFor([]));
    assert.equal(submitted.status, 201);
    const { referenceNumber } = submitted.body.data.application;
    const application = await EnrollmentApplication.findOne({ referenceNumber });
    assert.equal(application.status, 'pending');
    assert.equal(application.requests.length, 0);

    const approved = await request(app)
      .patch(`/api/enrollment/applications/${application.id}`)
      .set(auth(adminToken))
      .send({ status: 'approved' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.application.status, 'approved');
    const again = await request(app)
      .patch(`/api/enrollment/applications/${application.id}`)
      .set(auth(adminToken))
      .send({ status: 'rejected' });
    assert.equal(again.status, 409);

    const account = await request(app)
      .post('/api/enrollment/account')
      .send({ referenceNumber, birthday: '2012-03-04', email: 'ana@example.com', password: 'Welcome123' });
    assert.equal(account.status, 201);
    const student = await User.findOne({ email: 'ana@example.com' });
    const studentToken = await login(student, 'Welcome123');
    assert.deepEqual((await request(app).get('/api/classrooms').set(auth(studentToken))).body.data.items, []);

    // Inside the portal the student asks for a class, and joins it once it is approved.
    const asked = await request(app).post('/api/enrollment/requests').set(auth(studentToken)).send({ classroomIds: [english.id] });
    assert.equal(asked.status, 201);
    const list = await request(app).get('/api/enrollment/applications?status=pending').set(auth(adminToken));
    const [item] = list.body.data.items;
    const decided = await request(app)
      .patch(`/api/enrollment/applications/${item.id}/requests/${item.requests[0].id}`)
      .set(auth(adminToken))
      .send({ status: 'approved' });
    assert.equal(decided.status, 200);
    assert.deepEqual((await Classroom.findById(english.id)).students.map(String), [student.id]);
  });

  it('decides an application that names classes one class at a time', async () => {
    const submitted = await apply(applicationFor([english.id]));
    const application = await EnrollmentApplication.findOne({ referenceNumber: submitted.body.data.application.referenceNumber });
    const whole = await request(app)
      .patch(`/api/enrollment/applications/${application.id}`)
      .set(auth(adminToken))
      .send({ status: 'approved' });
    assert.equal(whole.status, 409);
  });

  it('turns away submissions that did not come from the form', async () => {
    const noToken = await request(app).post('/api/enrollment/applications').send(applicationFor([english.id]));
    assert.equal(noToken.status, 400);
    const filledTrap = await apply({ ...applicationFor([english.id]), website: 'https://spam.example' });
    assert.equal(filledTrap.status, 400);
    assert.equal(await EnrollmentApplication.countDocuments(), 0);
  });

  it('emails the reference number, the decision and a reminder on request', async () => {
    testOutbox.length = 0;
    const submitted = await apply(applicationFor([]));
    const { referenceNumber } = submitted.body.data.application;
    assert.equal(testOutbox.length, 1);
    assert.equal(testOutbox[0].to, 'ana@example.com');
    assert.match(testOutbox[0].text, new RegExp(referenceNumber));

    const reminded = await request(app).post('/api/enrollment/reference').send({ email: 'ana@example.com' });
    const unknown = await request(app).post('/api/enrollment/reference').send({ email: 'nobody@example.com' });
    assert.equal(reminded.status, 200);
    assert.deepEqual(unknown.body, reminded.body);
    assert.equal(testOutbox.length, 2);
    assert.match(testOutbox[1].text, new RegExp(referenceNumber));

    const application = await EnrollmentApplication.findOne({ referenceNumber });
    await request(app).patch(`/api/enrollment/applications/${application.id}`).set(auth(adminToken)).send({ status: 'approved' });
    assert.equal(testOutbox.length, 3);
    assert.match(testOutbox[2].text, /You have been approved/);
  });

  it('hides closed classes, refuses full ones and counts seats held by approved applicants', async () => {
    english.capacity = 1;
    await english.save();
    math.enrollmentOpen = false;
    await math.save();

    const open = await request(app).get('/api/enrollment/classes');
    assert.deepEqual(open.body.data.items.map((item) => item.name), ['ClassEng1']);
    assert.equal(open.body.data.items[0].seatsLeft, 1);
    assert.equal((await apply(applicationFor([math.id]))).status, 400);

    const first = await apply(applicationFor([english.id]));
    const application = await EnrollmentApplication.findOne({ referenceNumber: first.body.data.application.referenceNumber });
    const approved = await request(app)
      .patch(`/api/enrollment/applications/${application.id}/requests/${application.requests[0].id}`)
      .set(auth(adminToken))
      .send({ status: 'approved' });
    assert.equal(approved.status, 200);

    // The approved applicant has no account yet, but the only seat is theirs.
    const afterwards = await request(app).get('/api/enrollment/classes');
    assert.equal(afterwards.body.data.items[0].full, true);
    const second = await apply(applicationFor([english.id], { student: { email: 'ben@example.com' } }));
    assert.equal(second.status, 409);
  });

  it('lets a student withdraw a pending request and an administrator undo a decision', async () => {
    const student = await createUser({ role: 'student' });
    const studentToken = await login(student);
    const asked = await request(app)
      .post('/api/enrollment/requests')
      .set(auth(studentToken))
      .send({ classroomIds: [english.id, math.id] });
    const { id, requests } = asked.body.data.application;
    const byClass = Object.fromEntries(requests.map((entry) => [entry.classroom.name, entry.id]));

    const withdrawn = await request(app).delete(`/api/enrollment/requests/${id}/${byClass.ClassMath1}`).set(auth(studentToken));
    assert.equal(withdrawn.status, 200);
    assert.equal(withdrawn.body.data.application.status, 'pending');
    const someoneElse = await login(await createUser({ role: 'student' }));
    const notTheirs = await request(app).delete(`/api/enrollment/requests/${id}/${byClass.ClassEng1}`).set(auth(someoneElse));
    assert.equal(notTheirs.status, 404);

    const decide = (status) => request(app)
      .patch(`/api/enrollment/applications/${id}/requests/${byClass.ClassEng1}`)
      .set(auth(adminToken))
      .send({ status });
    assert.equal((await decide('approved')).status, 200);
    assert.deepEqual((await Classroom.findById(english.id)).students.map(String), [student.id]);
    const tooLate = await request(app).delete(`/api/enrollment/requests/${id}/${byClass.ClassEng1}`).set(auth(studentToken));
    assert.equal(tooLate.status, 409);

    const reopened = await request(app)
      .post(`/api/enrollment/applications/${id}/requests/${byClass.ClassEng1}/reopen`)
      .set(auth(adminToken));
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.data.application.status, 'pending');
    assert.equal((await Classroom.findById(english.id)).students.length, 0);
    assert.equal((await decide('rejected')).status, 200);
  });

  it('keeps what the student gave when applying with their account', async () => {
    const submitted = await apply(applicationFor([]));
    const { referenceNumber } = submitted.body.data.application;
    const application = await EnrollmentApplication.findOne({ referenceNumber });
    await request(app).patch(`/api/enrollment/applications/${application.id}`).set(auth(adminToken)).send({ status: 'approved' });
    await request(app)
      .post('/api/enrollment/account')
      .send({ referenceNumber, birthday: '2012-03-04', email: 'ana@example.com', password: 'Welcome123' });
    const student = await User.findOne({ email: 'ana@example.com' });
    const studentToken = await login(student, 'Welcome123');

    const own = await request(app).get('/api/enrollment/record').set(auth(studentToken));
    assert.equal(own.body.data.record.student.birthday, '2012-03-04');
    assert.equal(own.body.data.record.guardian.name, 'Maria Reyes');
    const forAdmin = await request(app).get(`/api/enrollment/users/${student.id}/record`).set(auth(adminToken));
    assert.equal(forAdmin.body.data.record.referenceNumber, referenceNumber);
    const handMade = await request(app).get(`/api/enrollment/users/${admin.id}/record`).set(auth(adminToken));
    assert.equal(handMade.body.data.record, null);
    const notForStudents = await request(app).get(`/api/enrollment/users/${student.id}/record`).set(auth(studentToken));
    assert.equal(notForStudents.status, 403);
  });

  it('lets the administrator approve into a different class', async () => {
    const submitted = await apply(applicationFor([english.id]));
    const application = await EnrollmentApplication.findOne({ referenceNumber: submitted.body.data.application.referenceNumber });

    const moved = await request(app)
      .patch(`/api/enrollment/applications/${application.id}/requests/${application.requests[0].id}`)
      .set(auth(adminToken))
      .send({ status: 'approved', classroomId: math.id });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.application.requests[0].classroom.name, 'ClassMath1');
    assert.equal(moved.body.data.application.requests[0].status, 'approved');
  });

  it('enrolls a returning student straight into the approved class', async () => {
    const student = await createUser({ role: 'student', email: 'ana@example.com' });
    const submitted = await apply(applicationFor([english.id]));
    assert.equal(submitted.status, 201);

    const list = await request(app).get('/api/enrollment/applications').set(auth(adminToken));
    const [item] = list.body.data.items;
    assert.deepEqual(item.account, { id: student.id, name: student.fullName, role: 'student', linked: false });

    const approved = await request(app)
      .patch(`/api/enrollment/applications/${item.id}/requests/${item.requests[0].id}`)
      .set(auth(adminToken))
      .send({ status: 'approved' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.application.account.linked, true);
    assert.deepEqual((await Classroom.findById(english.id)).students.map(String), [student.id]);
  });

  it('stores an optional photo and only shows it to administrators', async () => {
    const submitted = await apply(applicationFor([english.id]));
    const { referenceNumber } = submitted.body.data.application;
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

    const notAnImage = await request(app)
      .post(`/api/enrollment/applications/${referenceNumber}/photo`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('<html>not a photo</html>'));
    assert.equal(notAnImage.status, 400);
    const uploaded = await request(app)
      .post(`/api/enrollment/applications/${referenceNumber}/photo`)
      .set('Content-Type', 'application/octet-stream')
      .send(jpeg);
    assert.equal(uploaded.status, 201);

    const application = await EnrollmentApplication.findOne({ referenceNumber });
    const detail = await request(app).get(`/api/enrollment/applications/${application.id}`).set(auth(adminToken));
    assert.equal(detail.body.data.application.hasPhoto, true);
    const photo = await request(app).get(`/api/enrollment/applications/${application.id}/photo`).set(auth(adminToken));
    assert.equal(photo.status, 200);
    assert.equal(photo.headers['content-type'], 'image/jpeg');
    assert.deepEqual(photo.body, jpeg);

    const teacherToken = await login(await createUser({ role: 'teacher' }));
    const forbidden = await request(app).get(`/api/enrollment/applications/${application.id}/photo`).set(auth(teacherToken));
    assert.equal(forbidden.status, 403);
  });

  it('lets a signed-in student ask for another class', async () => {
    const student = await createUser({ role: 'student' });
    english.students = [student._id];
    await english.save();
    const studentToken = await login(student);

    const alreadyIn = await request(app).post('/api/enrollment/requests').set(auth(studentToken)).send({ classroomIds: [english.id] });
    assert.equal(alreadyIn.status, 409);
    const asked = await request(app).post('/api/enrollment/requests').set(auth(studentToken)).send({ classroomIds: [math.id] });
    assert.equal(asked.status, 201);
    const repeated = await request(app).post('/api/enrollment/requests').set(auth(studentToken)).send({ classroomIds: [math.id] });
    assert.equal(repeated.status, 409);

    const mine = await request(app).get('/api/enrollment/requests').set(auth(studentToken));
    assert.equal(mine.body.data.items.length, 1);
    assert.equal(mine.body.data.items[0].requests[0].classroom.name, 'ClassMath1');
    const notForStudents = await request(app).get('/api/enrollment/applications').set(auth(studentToken));
    assert.equal(notForStudents.status, 403);

    const list = await request(app).get('/api/enrollment/applications?status=pending').set(auth(adminToken));
    const [item] = list.body.data.items;
    assert.equal(item.kind, 'student');
    const approved = await request(app)
      .patch(`/api/enrollment/applications/${item.id}/requests/${item.requests[0].id}`)
      .set(auth(adminToken))
      .send({ status: 'approved' });
    assert.equal(approved.status, 200);
    assert.deepEqual((await Classroom.findById(math.id)).students.map(String), [student.id]);
  });
});
