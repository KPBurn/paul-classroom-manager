import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createUser, clearDatabase, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';
import { Classroom } from '../src/models/Classroom.js';
import { ClassSession } from '../src/models/ClassSession.js';
import { EnrollmentApplication } from '../src/models/EnrollmentApplication.js';
import { User } from '../src/models/User.js';

const app = createApp();
const login = async (user, password = TEST_PASSWORD) => {
  const response = await request(app).post('/api/auth/login').send({ email: user.email, password });
  assert.equal(response.status, 200);
  return response.body.data.token;
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });

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

    const invalid = await request(app).post('/api/enrollment/applications').send({ ...applicationFor([english.id]), agreed: false });
    assert.equal(invalid.status, 400);

    const submitted = await request(app).post('/api/enrollment/applications').send(applicationFor([english.id, math.id]));
    assert.equal(submitted.status, 201);
    const { referenceNumber } = submitted.body.data.application;
    assert.match(referenceNumber, /^ENR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(submitted.body.data.application.status, 'pending');

    const duplicate = await request(app).post('/api/enrollment/applications').send(applicationFor([english.id]));
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

  it('lets the administrator approve into a different class', async () => {
    const submitted = await request(app).post('/api/enrollment/applications').send(applicationFor([english.id]));
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
    const submitted = await request(app).post('/api/enrollment/applications').send(applicationFor([english.id]));
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
    const submitted = await request(app).post('/api/enrollment/applications').send(applicationFor([english.id]));
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
