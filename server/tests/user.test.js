import { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { Announcement } from '../src/models/Announcement.js';
import { Classroom } from '../src/models/Classroom.js';
import { ClassSession } from '../src/models/ClassSession.js';
import { User } from '../src/models/User.js';

const app = createApp();

async function signIn(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(res.status, 200, 'test setup: login should succeed');
  return res.body.data.token;
}

async function signedIn(role) {
  const user = await createUser({ role });
  return { user, token: await signIn(user) };
}

const as = (token) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
  patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
  put: (url, body) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(body),
  delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
});

const newUser = {
  firstName: 'Jane',
  lastName: 'Cruz',
  email: 'Jane.Cruz@Example.com',
  password: 'Secure1234',
  role: 'teacher',
};

before(startDatabase);
after(stopDatabase);
beforeEach(clearDatabase);

describe('RBAC on /api/users', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/users');
    assert.equal(res.status, 401);
  });

  it('forbids teachers from every user endpoint', async () => {
    const { user, token } = await signedIn('teacher');
    const client = as(token);
    const url = `/api/users/${user.id}`;

    const responses = await Promise.all([
      client.get('/api/users'),
      client.get(url),
      client.post('/api/users', newUser),
      client.patch(url, { role: 'admin' }),
      client.put(`${url}/password`, { password: 'Another123' }),
      client.delete(url),
    ]);

    assert.deepEqual(
      responses.map((r) => r.status),
      [403, 403, 403, 403, 403, 403],
    );
    assert.equal((await User.findById(user._id)).role, 'teacher');
  });
});

describe('GET /api/users', () => {
  it('lists users sorted by name with pagination, without secrets', async () => {
    const { token } = await signedIn('admin');
    await createUser({ firstName: 'Ana', lastName: 'Zamora' });
    await createUser({ firstName: 'Ben', lastName: 'Abad' });

    const res = await as(token).get('/api/users?page=1&limit=2');

    assert.equal(res.status, 200);
    const { items, pagination } = res.body.data;
    assert.equal(items[0].lastName, 'Abad');
    assert.deepEqual(pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
    for (const item of items) {
      assert.equal(item.password, undefined);
      assert.equal(item.tokenVersion, undefined);
      assert.ok(item.id);
    }
  });

  it('filters by role, status and multi-word search', async () => {
    const { token } = await signedIn('admin');
    await createUser({ firstName: 'Jane', lastName: 'Cruz', role: 'teacher' });
    await createUser({ firstName: 'Jane', lastName: 'Reyes', role: 'teacher', status: 'inactive' });
    await createUser({ firstName: 'Mark', lastName: 'Cruz', role: 'student' });

    const names = async (query) =>
      (await as(token).get(`/api/users?${query}`)).body.data.items.map((u) => `${u.firstName} ${u.lastName}`);

    assert.deepEqual(await names('search=jane%20cruz'), ['Jane Cruz']);
    assert.deepEqual(await names('role=teacher&status=inactive'), ['Jane Reyes']);
    assert.deepEqual(await names('role=student&status='), ['Mark Cruz']);
  });

  it('treats search text literally, not as a regex', async () => {
    const { token } = await signedIn('admin');
    const res = await as(token).get('/api/users?search=.*');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.items.length, 0);
  });

  it('rejects unknown filter values', async () => {
    const { token } = await signedIn('admin');
    const res = await as(token).get('/api/users?role=superuser');
    assert.equal(res.status, 400);
    assert.equal(res.body.details[0].field, 'role');
  });
});

describe('GET /api/users/:id', () => {
  it('returns one user, 404 for unknown ids and 400 for malformed ids', async () => {
    const { user, token } = await signedIn('admin');

    const found = await as(token).get(`/api/users/${user.id}`);
    assert.equal(found.status, 200);
    assert.equal(found.body.data.user.email, user.email);

    const missing = await as(token).get('/api/users/0123456789abcdef01234567');
    assert.equal(missing.status, 404);

    const malformed = await as(token).get('/api/users/not-an-id');
    assert.equal(malformed.status, 400);
  });
});

describe('POST /api/users', () => {
  it('creates a user who can then sign in', async () => {
    const { user: admin, token } = await signedIn('admin');

    const res = await as(token).post('/api/users', newUser);

    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.email, 'jane.cruz@example.com');
    assert.equal(res.body.data.user.password, undefined);
    assert.ok(await ActivityLog.exists({ action: 'user.created', actorId: admin._id }));

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jane.cruz@example.com', password: newUser.password });
    assert.equal(login.status, 200);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const { token } = await signedIn('admin');
    await as(token).post('/api/users', newUser);

    const duplicate = await as(token).post('/api/users', newUser);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, 'Email already exists');

    const weak = await as(token).post('/api/users', { ...newUser, email: 'other@example.com', password: 'short' });
    assert.equal(weak.status, 400);
    assert.ok(weak.body.details.some((d) => d.field === 'password'));
  });
});

describe('PATCH /api/users/:id', () => {
  it('updates details, role and status and logs the change', async () => {
    const { user: admin, token } = await signedIn('admin');
    const target = await createUser();

    const res = await as(token).patch(`/api/users/${target.id}`, {
      firstName: '  Maria ',
      role: 'admin',
      status: 'suspended',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.firstName, 'Maria');
    assert.equal(res.body.data.user.role, 'admin');
    assert.equal(res.body.data.user.status, 'suspended');
    const log = await ActivityLog.findOne({ action: 'user.updated', actorId: admin._id });
    assert.match(log.description, /firstName, role, status/);
  });

  it('applies a role change to the next request of the affected user', async () => {
    const { token: adminToken } = await signedIn('admin');
    const { user: teacher, token: teacherToken } = await signedIn('teacher');

    assert.equal((await as(teacherToken).get('/api/users')).status, 403);
    await as(adminToken).patch(`/api/users/${teacher.id}`, { role: 'admin' });
    assert.equal((await as(teacherToken).get('/api/users')).status, 200);
  });

  it('stops admins from changing their own role or status', async () => {
    const { user: admin, token } = await signedIn('admin');

    const role = await as(token).patch(`/api/users/${admin.id}`, { role: 'teacher' });
    const status = await as(token).patch(`/api/users/${admin.id}`, { status: 'inactive' });
    const name = await as(token).patch(`/api/users/${admin.id}`, { firstName: 'Still', role: 'admin' });

    assert.equal(role.status, 403);
    assert.equal(status.status, 403);
    assert.equal(name.status, 200);
    const stored = await User.findById(admin._id);
    assert.equal(stored.role, 'admin');
    assert.equal(stored.status, 'active');
  });

  it('rejects an email that belongs to someone else', async () => {
    const { token } = await signedIn('admin');
    const first = await createUser();
    const second = await createUser();

    const res = await as(token).patch(`/api/users/${second.id}`, { email: first.email });

    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'Email already exists');
  });

  it('rejects an empty update and ignores fields it does not allow', async () => {
    const { token } = await signedIn('admin');
    const target = await createUser();

    const empty = await as(token).patch(`/api/users/${target.id}`, {});
    assert.equal(empty.status, 400);

    const sneaky = await as(token).patch(`/api/users/${target.id}`, { lastName: 'Ok', password: 'Hacked123' });
    assert.equal(sneaky.status, 200);
    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    assert.equal(login.status, 200);
  });
});

describe('PUT /api/users/:id/password', () => {
  it('sets a new password and signs the user out everywhere', async () => {
    const { user: admin, token: adminToken } = await signedIn('admin');
    const { user: teacher, token: oldToken } = await signedIn('teacher');

    const res = await as(adminToken).put(`/api/users/${teacher.id}/password`, { password: 'NewSecret99' });
    assert.equal(res.status, 200);

    assert.equal((await as(oldToken).get('/api/auth/me')).status, 401);
    const oldPassword = await request(app).post('/api/auth/login').send({ email: teacher.email, password: TEST_PASSWORD });
    const newPassword = await request(app).post('/api/auth/login').send({ email: teacher.email, password: 'NewSecret99' });
    assert.equal(oldPassword.status, 401);
    assert.equal(newPassword.status, 200);
    assert.ok(await ActivityLog.exists({ action: 'user.password_reset', actorId: admin._id }));
  });
});

describe('DELETE /api/users/:id', () => {
  it('deletes a user', async () => {
    const { user: admin, token } = await signedIn('admin');
    const target = await createUser();

    const res = await as(token).delete(`/api/users/${target.id}`);

    assert.equal(res.status, 200);
    assert.equal(await User.exists({ _id: target._id }), null);
    assert.ok(await ActivityLog.exists({ action: 'user.deleted', actorId: admin._id, entityId: target._id }));
  });

  it('stops admins from deleting themselves', async () => {
    const { user: admin, token } = await signedIn('admin');
    const res = await as(token).delete(`/api/users/${admin.id}`);
    assert.equal(res.status, 403);
    assert.ok(await User.exists({ _id: admin._id }));
  });

  it('keeps users who authored announcements', async () => {
    const { token } = await signedIn('admin');
    const author = await createUser({ role: 'admin' });
    await Announcement.create({ title: 'Hi', body: 'Hello', type: 'General', createdBy: author._id });

    const res = await as(token).delete(`/api/users/${author.id}`);

    assert.equal(res.status, 409);
    assert.ok(await User.exists({ _id: author._id }));
  });
});

describe('users who belong to classrooms', () => {
  const hours = (count) => new Date(Date.now() + count * 60 * 60_000);

  it('refuses to delete a user that classrooms, sessions or feedback still refer to', async () => {
    const { token } = await signedIn('admin');
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const classroom = await Classroom.create({ name: 'Room A', teacher: teacher._id, teachers: [teacher._id], students: [student._id] });
    await ClassSession.create({
      classroom: classroom._id,
      assignedTeachers: [teacher._id],
      assignedStudents: [student._id],
      title: 'Lesson',
      startsAt: hours(-2),
      endsAt: hours(-1),
    });

    const res = await as(token).delete(`/api/users/${student.id}`);

    assert.equal(res.status, 409);
    assert.match(res.body.message, /1 classroom and 1 session/);
    assert.match(res.body.message, /Inactive/);
    assert.ok(await User.exists({ _id: student._id }));
  });

  it('takes a teacher out of their classrooms and unfinished sessions when their role changes', async () => {
    const { token } = await signedIn('admin');
    const teacher = await createUser({ role: 'teacher' });
    const coTeacher = await createUser({ role: 'teacher' });
    const classroom = await Classroom.create({ name: 'Room B', teacher: teacher._id, teachers: [teacher._id, coTeacher._id] });
    const session = (startsAt, endsAt, assignedTeachers) => ClassSession.create({
      classroom: classroom._id, assignedTeachers, assignedStudents: [], title: 'Lesson', startsAt, endsAt,
    });
    const past = await session(hours(-2), hours(-1), [teacher._id, coTeacher._id]);
    const shared = await session(hours(1), hours(2), [teacher._id, coTeacher._id]);
    const alone = await session(hours(3), hours(4), [teacher._id]);

    const res = await as(token).patch(`/api/users/${teacher.id}`, { role: 'student' });

    assert.equal(res.status, 200);
    const saved = await Classroom.findById(classroom._id);
    assert.deepEqual(saved.teachers.map(String), [coTeacher.id]);
    assert.equal(String(saved.teacher), coTeacher.id);
    const teachersOf = async (item) => (await ClassSession.findById(item._id)).assignedTeachers.map(String);
    // The finished lesson keeps its record of who taught it.
    assert.deepEqual(await teachersOf(past), [teacher.id, coTeacher.id]);
    assert.deepEqual(await teachersOf(shared), [coTeacher.id]);
    // A session must keep a teacher, so it takes the classroom's remaining one.
    assert.deepEqual(await teachersOf(alone), [coTeacher.id]);
  });

  it('refuses to change the role of a classroom’s only teacher', async () => {
    const { token } = await signedIn('admin');
    const teacher = await createUser({ role: 'teacher' });
    await Classroom.create({ name: 'Room C', teacher: teacher._id, teachers: [teacher._id] });

    const res = await as(token).patch(`/api/users/${teacher.id}`, { role: 'student' });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /only teacher of Room C/);
    assert.equal((await User.findById(teacher._id)).role, 'teacher');
  });

  it('takes a student out of their classrooms when they become a teacher', async () => {
    const { token } = await signedIn('admin');
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const classmate = await createUser({ role: 'student' });
    const classroom = await Classroom.create({
      name: 'Room D', teacher: teacher._id, teachers: [teacher._id], students: [student._id, classmate._id],
    });
    const upcoming = await ClassSession.create({
      classroom: classroom._id,
      assignedTeachers: [teacher._id],
      assignedStudents: [student._id, classmate._id],
      title: 'Lesson',
      startsAt: hours(1),
      endsAt: hours(2),
    });

    const res = await as(token).patch(`/api/users/${student.id}`, { role: 'teacher' });

    assert.equal(res.status, 200);
    assert.deepEqual((await Classroom.findById(classroom._id)).students.map(String), [classmate.id]);
    assert.deepEqual((await ClassSession.findById(upcoming._id)).assignedStudents.map(String), [classmate.id]);
  });

  it('leaves classrooms alone when only the name or status changes', async () => {
    const { token } = await signedIn('admin');
    const teacher = await createUser({ role: 'teacher' });
    const classroom = await Classroom.create({ name: 'Room E', teacher: teacher._id, teachers: [teacher._id] });

    const res = await as(token).patch(`/api/users/${teacher.id}`, { firstName: 'Renamed', status: 'inactive' });

    assert.equal(res.status, 200);
    assert.deepEqual((await Classroom.findById(classroom._id)).teachers.map(String), [teacher.id]);
  });
});
