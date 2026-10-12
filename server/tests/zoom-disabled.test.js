import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';
import { Classroom } from '../src/models/Classroom.js';
import { ClassSession } from '../src/models/ClassSession.js';
import { SystemSettings } from '../src/models/SystemSettings.js';

const app = createApp();

before(startDatabase);
after(stopDatabase);

describe('without Zoom in the environment', () => {
  it('offers no Zoom until it is chosen and set up in System Settings', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const classroom = await Classroom.create({ name: 'Class', teacher: teacher._id, teachers: [teacher._id] });
    const session = await ClassSession.create({
      classroom: classroom._id,
      title: 'Lesson',
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    });
    const { body } = await request(app).post('/api/auth/login').send({ email: teacher.email, password: TEST_PASSWORD });
    const auth = { Authorization: `Bearer ${body.data.token}` };

    const room = await request(app).get(`/api/sessions/${session.id}/room`).set(auth);
    assert.equal(room.status, 200);
    assert.deepEqual(room.body.data.session.zoom, { enabled: false });
    assert.equal(room.body.data.session.zoomMeeting, false);

    const opened = await request(app).post(`/api/sessions/${session.id}/zoom`).set(auth);
    assert.equal(opened.status, 404);
    assert.match(opened.body.message, /not set up/);

    // Choosing Zoom without credentials offers nothing; saving them in System Settings offers it.
    await SystemSettings.create({ _id: 'system', classroomIntegration: 'zoom' });
    const zoomOf = async () => (await request(app).get(`/api/sessions/${session.id}/room`).set(auth)).body.data.session.zoom;
    assert.deepEqual(await zoomOf(), { enabled: false });
    await SystemSettings.updateOne(
      { _id: 'system' },
      { $set: { zoom: { accountId: 'account', clientId: 'client', clientSecret: 'secret' } } },
    );
    assert.deepEqual(await zoomOf(), { enabled: true, timeLimitMinutes: 40 });
  });
});
