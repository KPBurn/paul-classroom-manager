import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createUser, clearDatabase, startDatabase, stopDatabase } from './helpers.js';
import { createApp } from '../src/app.js';

const app = createApp();

async function tokenFor(user) {
  const response = await request(app).post('/api/auth/login').send({
    email: user.email,
    password: 'Password123',
  });
  assert.equal(response.status, 200);
  return response.body.data.token;
}

before(startDatabase);
after(stopDatabase);
beforeEach(clearDatabase);

describe('temporary role testing', () => {
  it('is disabled by default and rejects no-password role login', async () => {
    const status = await request(app).get('/api/auth/test-login/status');
    const login = await request(app).post('/api/auth/test-login').send({ role: 'student' });

    assert.equal(status.status, 200);
    assert.deepEqual(status.body.data, { roleTestingEnabled: false });
    assert.equal(login.status, 403);
  });

  it('lets only admins toggle role testing', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const token = await tokenFor(teacher);

    const response = await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleTestingEnabled: true });

    assert.equal(response.status, 403);
  });

  it('starts a selected-role session and revokes it as soon as testing is disabled', async () => {
    const admin = await createUser({ role: 'admin' });
    const student = await createUser({ role: 'student' });
    const adminToken = await tokenFor(admin);

    const enabled = await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleTestingEnabled: true });
    assert.equal(enabled.status, 200);

    const testLogin = await request(app).post('/api/auth/test-login').send({ role: 'student' });
    assert.equal(testLogin.status, 200);
    assert.equal(testLogin.body.data.user.id, student.id);
    assert.equal(testLogin.body.data.user.role, 'student');

    const testToken = testLogin.body.data.token;
    const active = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${testToken}`);
    assert.equal(active.status, 200);

    const disabled = await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleTestingEnabled: false });
    assert.equal(disabled.status, 200);

    const revoked = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${testToken}`);
    assert.equal(revoked.status, 401);
  });

  it('rejects test login when there is no active account for the selected role', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleTestingEnabled: true });

    const response = await request(app).post('/api/auth/test-login').send({ role: 'student' });

    assert.equal(response.status, 404);
  });
});
