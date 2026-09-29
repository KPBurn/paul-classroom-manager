import { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { Announcement, ANNOUNCEMENT_LIMITS } from '../src/models/Announcement.js';

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
