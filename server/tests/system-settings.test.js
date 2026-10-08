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

describe('classroom integration settings', () => {
  it('defaults to WebRTC with every credential unset', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);

    const response = await request(app)
      .get('/api/system-settings')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, {
      roleTestingEnabled: false,
      classroomIntegration: 'webrtc',
      webrtc: {
        meteredTurnHost: '',
        meteredTurnApiKeySet: false,
        iceServersJson: '',
        envConfigured: {
          meteredTurnHost: Boolean(process.env.METERED_TURN_HOST),
          meteredTurnApiKey: Boolean(process.env.METERED_TURN_API_KEY),
          iceServers: Boolean(process.env.WEBRTC_ICE_SERVERS),
        },
      },
      zoom: { accountId: '', clientId: '', clientSecretSet: false },
    });
  });

  it('saves WebRTC credentials without ever returning the API key', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);

    const saved = await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classroomIntegration: 'webrtc',
        webrtc: {
          meteredTurnHost: 'myschool.metered.live',
          meteredTurnApiKey: 'metered-secret-key',
          iceServersJson: '[{"urls":"stun:stun.l.google.com:19302"}]',
        },
      });

    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.classroomIntegration, 'webrtc');
    assert.equal(saved.body.data.webrtc.meteredTurnHost, 'myschool.metered.live');
    assert.equal(saved.body.data.webrtc.meteredTurnApiKeySet, true);
    assert.equal(saved.body.data.webrtc.iceServersJson, '[{"urls":"stun:stun.l.google.com:19302"}]');
    assert.ok(!JSON.stringify(saved.body).includes('metered-secret-key'), 'the API key must not be echoed back');

    const reread = await request(app)
      .get('/api/system-settings')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(reread.body.data.webrtc.meteredTurnApiKeySet, true);
    assert.ok(!JSON.stringify(reread.body).includes('metered-secret-key'));

    // An empty string clears the stored secret.
    const cleared = await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ webrtc: { meteredTurnApiKey: '' } });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.webrtc.meteredTurnApiKeySet, false);
  });

  it('lets an admin switch to Zoom and store the Zoom credentials, secret masked', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);

    const saved = await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classroomIntegration: 'zoom',
        zoom: { accountId: 'abc123def456', clientId: 'zoom-client-id', clientSecret: 'zoom-client-secret' },
      });

    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.classroomIntegration, 'zoom');
    assert.equal(saved.body.data.zoom.accountId, 'abc123def456');
    assert.equal(saved.body.data.zoom.clientId, 'zoom-client-id');
    assert.equal(saved.body.data.zoom.clientSecretSet, true);
    assert.ok(!JSON.stringify(saved.body).includes('zoom-client-secret'), 'the client secret must not be echoed back');
  });

  it('rejects invalid integration values', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);

    const cases = [
      { classroomIntegration: 'teams' },
      { webrtc: { meteredTurnHost: 'evil.example.com' } },
      { webrtc: { iceServersJson: 'not json at all' } },
      { webrtc: { iceServersJson: '[{"urls":"https://example.com"}]' } },
      {},
    ];
    for (const payload of cases) {
      const response = await request(app)
        .patch('/api/system-settings')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(payload)}`);
    }
  });

  it('is forbidden to teachers', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const token = await tokenFor(teacher);

    const response = await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ classroomIntegration: 'zoom' });

    assert.equal(response.status, 403);
  });
});

