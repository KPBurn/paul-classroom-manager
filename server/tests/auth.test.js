import { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { User } from '../src/models/User.js';

const app = createApp();

const login = (email, password = TEST_PASSWORD) =>
  request(app).post('/api/auth/login').send({ email, password });

async function tokenFor(user) {
  const res = await login(user.email);
  assert.equal(res.status, 200, 'test setup: login should succeed');
  return res.body.data.token;
}

before(startDatabase);
after(stopDatabase);
beforeEach(clearDatabase);

describe('POST /api/auth/login', () => {
  it('returns a token and the user without the password', async () => {
    const user = await createUser({ firstName: 'John', lastName: 'Doe' });

    const res = await login(user.email.toUpperCase());

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.data.token, 'string');
    assert.deepEqual(res.body.data.user, {
      id: user.id,
      firstName: 'John',
      lastName: 'Doe',
      name: 'John Doe',
      email: user.email,
      role: 'teacher',
      status: 'active',
      permissions: ['announcements:read'],
      availability: [],
    });
    assert.ok(await ActivityLog.exists({ action: 'auth.login', actorId: user._id }));
  });

  it('stores passwords as bcrypt hashes', async () => {
    const user = await createUser();
    const stored = await User.findById(user._id).select('+password');

    assert.notEqual(stored.password, TEST_PASSWORD);
    assert.match(stored.password, /^\$2[aby]\$12\$/);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const user = await createUser();

    const wrongPassword = await login(user.email, 'WrongPassword1');
    const unknownEmail = await login('nobody@example.com');

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.body.message, 'Invalid email or password');
    assert.equal(unknownEmail.body.message, wrongPassword.body.message);
  });

  for (const status of ['inactive', 'suspended']) {
    it(`rejects ${status} accounts`, async () => {
      const user = await createUser({ status });
      const res = await login(user.email);
      assert.equal(res.status, 403);
      assert.equal(res.body.data, undefined);
    });
  }

  it('allows active students to sign in without admin or teacher permissions', async () => {
    const user = await createUser({ role: 'student' });
    const res = await login(user.email);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.user.permissions, []);
  });

  it('returns field-level validation errors', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    const fields = res.body.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['email', 'password']);
  });

  it('blocks NoSQL operator injection', async () => {
    await createUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });

    assert.equal(res.status, 400);
    assert.equal(res.body.data, undefined);
  });

  it('rejects malformed JSON without leaking parser internals', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Malformed JSON body');
  });
});

describe('GET /api/auth/me', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('rejects a tampered token', async () => {
    const user = await createUser();
    const token = await tokenFor(user);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token.slice(0, -2)}xx`);

    assert.equal(res.status, 401);
  });

  it('returns the signed-in user', async () => {
    const user = await createUser();
    const token = await tokenFor(user);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, user.id);
  });

  it('revokes access as soon as the account is deactivated', async () => {
    const user = await createUser();
    const token = await tokenFor(user);
    await User.updateOne({ _id: user._id }, { status: 'inactive' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 401);
  });
});

describe('POST /api/auth/register (RBAC)', () => {
  const newUser = {
    firstName: 'Jane',
    lastName: 'Cruz',
    email: 'jane@example.com',
    password: 'Secure1234',
    role: 'teacher',
  };

  it('is forbidden to teachers', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const token = await tokenFor(teacher);

    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send(newUser);

    assert.equal(res.status, 403);
    assert.equal(await User.exists({ email: newUser.email }), null);
  });

  it('lets admins create users and rejects duplicate emails', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    const register = () =>
      request(app).post('/api/auth/register').set('Authorization', `Bearer ${token}`).send(newUser);

    const created = await register();
    assert.equal(created.status, 201);
    assert.equal(created.body.data.user.email, newUser.email);
    assert.equal(created.body.data.user.password, undefined);

    const duplicate = await register();
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, 'Email already exists');
  });

  it('enforces the password policy', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);

    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...newUser, password: 'short' });

    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((d) => d.field === 'password'));
  });
});

describe('POST /api/auth/logout', () => {
  it('records the sign-out', async () => {
    const user = await createUser();
    const token = await tokenFor(user);

    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.ok(await ActivityLog.exists({ action: 'auth.logout', actorId: user._id }));
  });
});

describe('API basics', () => {
  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.database, 'connected');
  });

  it('returns the standard envelope for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
  });
});

describe('PUT /api/auth/password', () => {
  const change = (token, body) => request(app).put('/api/auth/password').set('Authorization', `Bearer ${token}`).send(body);

  it('changes the password, keeps this session and signs out the others', async () => {
    const user = await createUser();
    const thisDevice = (await login(user.email)).body.data.token;
    const otherDevice = (await login(user.email)).body.data.token;

    const res = await change(thisDevice, { currentPassword: TEST_PASSWORD, newPassword: 'Different123' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, user.email);
    const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal((await me(res.body.data.token)).status, 200);
    assert.equal((await me(otherDevice)).status, 401);
    assert.equal((await me(thisDevice)).status, 401);
    assert.equal((await login(user.email, 'Different123')).status, 200);
    assert.equal((await login(user.email)).status, 401);
    assert.ok(await ActivityLog.exists({ action: 'user.password_changed', actorId: user._id }));
  });

  it('needs the current password', async () => {
    const user = await createUser();
    const token = (await login(user.email)).body.data.token;

    const res = await change(token, { currentPassword: 'NotMyPassword1', newPassword: 'Different123' });

    assert.equal(res.status, 400);
    assert.equal(res.body.details[0].field, 'currentPassword');
    assert.equal((await login(user.email)).status, 200);
  });

  it('applies the password policy and refuses the same password again', async () => {
    const user = await createUser();
    const token = (await login(user.email)).body.data.token;

    assert.equal((await change(token, { currentPassword: TEST_PASSWORD, newPassword: 'short' })).status, 400);
    assert.equal((await change(token, { currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })).status, 400);
    assert.equal((await request(app).put('/api/auth/password').send({ currentPassword: 'a', newPassword: 'Different123' })).status, 401);
  });

  it('is not available to a temporary role-testing session', async () => {
    const { SystemSettings } = await import('../src/models/SystemSettings.js');
    await createUser({ role: 'teacher' });
    await SystemSettings.create({ _id: 'system', roleTestingEnabled: true });
    const tester = await request(app).post('/api/auth/test-login').send({ role: 'teacher' });
    assert.equal(tester.status, 200);

    const res = await change(tester.body.data.token, { currentPassword: TEST_PASSWORD, newPassword: 'Different123' });

    assert.equal(res.status, 403);
  });
});
