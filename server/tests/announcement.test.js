import { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { Announcement, ANNOUNCEMENT_LIMITS } from '../src/models/Announcement.js';
import { Classroom } from '../src/models/Classroom.js';

const app = createApp();

async function tokenFor(role) {
  const user = await createUser({ role });
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  return { user, token: res.body.data.token };
}

const validAnnouncement = {
  title: '  Enrollment opens Monday  ',
  body: 'Enrollment for the second semester opens on Monday at 8:00 AM.',
  type: 'Academic',
};

before(startDatabase);
after(stopDatabase);
beforeEach(clearDatabase);

describe('POST /api/announcements', () => {
  it('lets an admin create an announcement', async () => {
    const { user, token } = await tokenFor('admin');

    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send(validAnnouncement);

    assert.equal(res.status, 201);
    const { announcement } = res.body.data;
    assert.equal(announcement.title, 'Enrollment opens Monday');
    assert.equal(announcement.type, 'Academic');
    assert.equal(announcement.createdBy, user.id);
    assert.ok(announcement.createdAt);
    assert.ok(await ActivityLog.exists({ action: 'announcement.created', actorId: user._id }));
  });

  it('is forbidden to teachers', async () => {
    const { token } = await tokenFor('teacher');

    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send(validAnnouncement);

    assert.equal(res.status, 403);
    assert.equal(await Announcement.countDocuments(), 0);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/announcements').send(validAnnouncement);
    assert.equal(res.status, 401);
  });

  it('enforces required fields and character limits', async () => {
    const { token } = await tokenFor('admin');

    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'x'.repeat(ANNOUNCEMENT_LIMITS.title + 1),
        body: '   ',
        type: 'y'.repeat(ANNOUNCEMENT_LIMITS.type + 1),
      });

    assert.equal(res.status, 400);
    const fields = res.body.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['body', 'title', 'type']);
  });
});

describe('GET /api/announcements', () => {
  it('lists newest first with pagination', async () => {
    const { user, token } = await tokenFor('admin');
    for (let i = 1; i <= 3; i += 1) {
      await Announcement.create({ ...validAnnouncement, title: `Notice ${i}`, createdBy: user._id });
    }

    const res = await request(app)
      .get('/api/announcements?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data.items.map((a) => a.title),
      ['Notice 3', 'Notice 2'],
    );
    assert.deepEqual(res.body.data.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
    assert.equal(res.body.data.items[0].createdBy.firstName, user.firstName);
  });

  it('is readable by teachers', async () => {
    const { token } = await tokenFor('teacher');
    const res = await request(app).get('/api/announcements').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
  });

  it('rejects invalid pagination', async () => {
    const { token } = await tokenFor('admin');
    const res = await request(app)
      .get('/api/announcements?limit=1000')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 400);
  });
});

describe('managing school-wide announcements', () => {
  const seedAnnouncement = (user) => Announcement.create({ ...validAnnouncement, title: 'Original', createdBy: user._id });

  it('lets an admin edit, archive, restore and delete an announcement', async () => {
    const { user, token } = await tokenFor('admin');
    const announcement = await seedAnnouncement(user);
    const url = `/api/announcements/${announcement.id}`;
    const as = (req) => req.set('Authorization', `Bearer ${token}`);

    const updated = await as(request(app).patch(url)).send({ title: ' Revised ' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.announcement.title, 'Revised');
    assert.equal(updated.body.data.announcement.body, validAnnouncement.body);

    const archived = await as(request(app).post(`${url}/archive`));
    assert.equal(archived.body.data.announcement.status, 'archived');
    assert.equal((await as(request(app).get('/api/announcements'))).body.data.items.length, 0);
    const archivedList = await as(request(app).get('/api/announcements?status=archived'));
    assert.deepEqual(archivedList.body.data.items.map((item) => item.title), ['Revised']);

    const restored = await as(request(app).post(`${url}/restore`));
    assert.equal(restored.body.data.announcement.status, 'active');

    assert.equal((await as(request(app).delete(url))).status, 200);
    assert.equal(await Announcement.countDocuments(), 0);
    const actions = (await ActivityLog.find({ actorId: user._id })).map((log) => log.action);
    for (const action of ['announcement.updated', 'announcement.archived', 'announcement.restored', 'announcement.deleted']) {
      assert.ok(actions.includes(action), `missing ${action}`);
    }
  });

  it('stops teachers from changing or seeing archived school-wide announcements', async () => {
    const { user: admin } = await tokenFor('admin');
    const { token } = await tokenFor('teacher');
    const announcement = await seedAnnouncement(admin);
    const url = `/api/announcements/${announcement.id}`;
    const as = (req) => req.set('Authorization', `Bearer ${token}`);

    assert.equal((await as(request(app).patch(url)).send({ title: 'x' })).status, 403);
    assert.equal((await as(request(app).post(`${url}/archive`))).status, 403);
    assert.equal((await as(request(app).delete(url))).status, 403);
    assert.equal((await as(request(app).get('/api/announcements?status=archived'))).status, 403);
    assert.equal((await Announcement.findById(announcement._id)).title, 'Original');
  });

  it('rejects empty updates and unknown announcements', async () => {
    const { user, token } = await tokenFor('admin');
    const announcement = await seedAnnouncement(user);
    const as = (req) => req.set('Authorization', `Bearer ${token}`);

    assert.equal((await as(request(app).patch(`/api/announcements/${announcement.id}`)).send({})).status, 400);
    assert.equal((await as(request(app).delete('/api/announcements/000000000000000000000000'))).status, 404);
  });
});

describe('classroom announcements', () => {
  async function setupClassroom() {
    const teacher = await tokenFor('teacher');
    const otherTeacher = await tokenFor('teacher');
    const student = await tokenFor('student');
    const outsider = await tokenFor('student');
    const admin = await tokenFor('admin');
    const classroom = await Classroom.create({
      name: 'Grade 5 Rizal',
      teacher: teacher.user._id,
      teachers: [teacher.user._id],
      students: [student.user._id],
    });
    return { classroom, teacher, otherTeacher, student, outsider, admin };
  }
  const post = (classroom, token) => request(app)
    .post(`/api/classrooms/${classroom.id}/announcements`)
    .set('Authorization', `Bearer ${token}`)
    .send(validAnnouncement);
  const list = (classroom, token, query = '') => request(app)
    .get(`/api/classrooms/${classroom.id}/announcements${query}`)
    .set('Authorization', `Bearer ${token}`);

  it('lets the class teacher post and enrolled students read', async () => {
    const { classroom, teacher, student } = await setupClassroom();

    const created = await post(classroom, teacher.token);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.announcement.classroom.name, 'Grade 5 Rizal');
    assert.equal(created.body.data.announcement.createdBy.firstName, teacher.user.firstName);

    const studentView = await list(classroom, student.token);
    assert.equal(studentView.status, 200);
    assert.deepEqual(studentView.body.data.items.map((item) => item.title), ['Enrollment opens Monday']);

    // Classroom posts stay out of the school-wide feed.
    const schoolWide = await request(app).get('/api/announcements').set('Authorization', `Bearer ${teacher.token}`);
    assert.equal(schoolWide.body.data.items.length, 0);
  });

  it('keeps other teachers, students and archived classrooms out', async () => {
    const { classroom, otherTeacher, student, outsider, admin } = await setupClassroom();

    assert.equal((await post(classroom, otherTeacher.token)).status, 403);
    assert.equal((await post(classroom, student.token)).status, 403);
    assert.equal((await list(classroom, outsider.token)).status, 403);
    assert.equal((await list(classroom, student.token, '?status=archived')).status, 403);

    classroom.status = 'archived';
    await classroom.save();
    assert.equal((await post(classroom, admin.token)).status, 409);
  });

  it('lets the class teacher edit, archive and delete only their classroom posts', async () => {
    const { classroom, teacher, otherTeacher, student } = await setupClassroom();
    const { body } = await post(classroom, teacher.token);
    const url = `/api/announcements/${body.data.announcement.id}`;
    const as = (req, token) => req.set('Authorization', `Bearer ${token}`);

    assert.equal((await as(request(app).patch(url), otherTeacher.token).send({ title: 'x' })).status, 403);
    assert.equal((await as(request(app).delete(url), student.token)).status, 403);

    const updated = await as(request(app).patch(url), teacher.token).send({ body: 'Moved to Tuesday.' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.announcement.body, 'Moved to Tuesday.');

    await as(request(app).post(`${url}/archive`), teacher.token);
    assert.equal((await list(classroom, student.token)).body.data.items.length, 0);
    assert.equal((await list(classroom, teacher.token, '?status=archived')).body.data.items.length, 1);

    assert.equal((await as(request(app).delete(url), teacher.token)).status, 200);
    assert.equal(await Announcement.countDocuments(), 0);
  });
});
