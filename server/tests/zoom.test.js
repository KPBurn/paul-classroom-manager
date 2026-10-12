import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

// Zoom is switched on for this file only: each test file runs in its own process.
process.env.ZOOM_ACCOUNT_ID = 'test-account';
process.env.ZOOM_CLIENT_ID = 'test-client';
process.env.ZOOM_CLIENT_SECRET = 'test-client-secret';

const { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } = await import('./helpers.js');
const { default: request } = await import('supertest');
const { io: createClient } = await import('socket.io-client');
const { createApp } = await import('../src/app.js');
const { Classroom } = await import('../src/models/Classroom.js');
const { ClassSession } = await import('../src/models/ClassSession.js');
const { SystemSettings } = await import('../src/models/SystemSettings.js');
const { attachSessionSocket } = await import('../src/realtime/sessionSocket.js');
const { createZoomClient } = await import('../src/services/zoom.service.js');

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** A stand-in for Zoom's API: it keeps meetings in memory and records every call. */
function fakeZoom() {
  const zoom = { meetings: new Map(), calls: [], nextId: 81_000_000_001, tokens: 0 };
  zoom.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? 'GET';
    zoom.calls.push({ method, url, options });
    if (url.href.startsWith('https://zoom.us/oauth/token')) {
      zoom.tokens += 1;
      return response(200, { access_token: `token-${zoom.tokens}`, expires_in: 3600 });
    }
    const meetingPath = url.pathname.match(/^\/v2\/meetings\/(\d+)(\/status)?$/);
    if (method === 'POST' && url.pathname === '/v2/users/me/meetings') {
      const id = zoom.nextId;
      zoom.nextId += 1;
      zoom.meetings.set(String(id), { id, ...JSON.parse(options.body), ended: false });
      return response(201, { id, join_url: `https://zoom.us/j/${id}?pwd=secret`, start_url: `https://zoom.us/s/${id}?zak=host` });
    }
    const meeting = meetingPath && zoom.meetings.get(meetingPath[1]);
    if (!meeting) return response(404, { code: 3001, message: 'Meeting does not exist' });
    if (method === 'GET') {
      return response(200, { id: meeting.id, join_url: `https://zoom.us/j/${meeting.id}?pwd=secret`, start_url: `https://zoom.us/s/${meeting.id}?zak=fresh` });
    }
    if (method === 'PUT' && meetingPath[2]) {
      meeting.ended = true;
      return response(204);
    }
    if (method === 'DELETE') {
      zoom.meetings.delete(meetingPath[1]);
      return response(204);
    }
    return response(400, { code: 300, message: 'Unexpected request' });
  };
  return zoom;
}

describe('the Zoom client', () => {
  const client = (zoom) => createZoomClient({
    accountId: 'acct',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    fetchImpl: zoom.fetch,
  });

  it('signs in with the account credentials once and reuses the token', async () => {
    const zoom = fakeZoom();
    const zoomClient = client(zoom);
    const meeting = await zoomClient.createMeeting({
      topic: 'Class: Lesson',
      startsAt: new Date('2026-10-12T09:00:00.000Z'),
      endsAt: new Date('2026-10-12T10:00:00.000Z'),
      timezone: 'Asia/Manila',
    });
    await zoomClient.getMeeting(meeting.id);

    assert.equal(zoom.tokens, 1);
    const signIn = zoom.calls[0];
    assert.equal(signIn.method, 'POST');
    assert.equal(signIn.url.searchParams.get('grant_type'), 'account_credentials');
    assert.equal(signIn.url.searchParams.get('account_id'), 'acct');
    assert.equal(signIn.options.headers.Authorization, `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);

    const created = JSON.parse(zoom.calls[1].options.body);
    assert.equal(zoom.calls[1].options.headers.Authorization, 'Bearer token-1');
    assert.equal(created.start_time, '2026-10-12T09:00:00Z');
    assert.equal(created.duration, 60);
    assert.equal(created.settings.join_before_host, true);
    assert.deepEqual(meeting, {
      id: String(meeting.id),
      joinUrl: `https://zoom.us/j/${meeting.id}?pwd=secret`,
      startUrl: `https://zoom.us/s/${meeting.id}?zak=host`,
    });
  });

  it('signs in again once when Zoom stops accepting the token', async () => {
    const zoom = fakeZoom();
    let refused = false;
    const fetchImpl = async (input, options) => {
      if (!refused && String(input).includes('/v2/meetings/')) {
        refused = true;
        return response(401, { code: 124, message: 'Invalid access token.' });
      }
      return zoom.fetch(input, options);
    };
    const zoomClient = createZoomClient({ accountId: 'a', clientId: 'b', clientSecret: 'c', fetchImpl });
    const { id } = await zoomClient.createMeeting({
      topic: 'T', startsAt: new Date(), endsAt: new Date(Date.now() + 60_000), timezone: 'UTC',
    });
    await zoomClient.getMeeting(id);
    assert.equal(zoom.tokens, 2);
  });

  it('reports failures without the secret or a token in the message', async () => {
    const refused = createZoomClient({
      accountId: 'a',
      clientId: 'b',
      clientSecret: 'very-secret',
      fetchImpl: async () => response(400, { reason: 'invalid_client' }),
    });
    await assert.rejects(refused.getMeeting('1'), (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.message.includes('very-secret'), false);
      return true;
    });

    const unreachable = createZoomClient({
      accountId: 'a', clientId: 'b', clientSecret: 'c', fetchImpl: async () => { throw new TypeError('fetch failed'); },
    });
    await assert.rejects(unreachable.getMeeting('1'), { statusCode: 503 });
  });
});

describe('Zoom beside the class room', () => {
  const app = createApp();
  const server = createServer(app);
  const ioServer = attachSessionSocket(server);
  const realFetch = globalThis.fetch;
  let zoom;
  let serverUrl;
  let sockets = [];

  const login = async (user) => {
    const reply = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    assert.equal(reply.status, 200);
    return reply.body.data.token;
  };
  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const emitAck = (socket, event, ...args) => new Promise((resolve) => {
    socket.emit(event, ...args, resolve);
  });
  async function connect(token) {
    const socket = createClient(serverUrl, { auth: { token }, reconnection: false });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async function setupClass() {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const outsider = await createUser({ role: 'student' });
    const classroom = await Classroom.create({
      name: 'Zoom Class', teacher: teacher._id, teachers: [teacher._id], students: [student._id],
    });
    const session = await ClassSession.create({
      classroom: classroom._id,
      assignedTeachers: [teacher._id],
      assignedStudents: [student._id],
      title: 'Lesson',
      startsAt: new Date(Date.now() - 5 * 60_000),
      endsAt: new Date(Date.now() + 55 * 60_000),
    });
    return {
      teacher, student, outsider, classroom, session,
      teacherToken: await login(teacher),
      studentToken: await login(student),
      outsiderToken: await login(outsider),
    };
  }
  const openZoom = (token, session) => request(app).post(`/api/sessions/${session.id}/zoom`).set(auth(token));
  const zoomLink = (token, session) => request(app).get(`/api/sessions/${session.id}/zoom`).set(auth(token));

  before(async () => {
    await startDatabase();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    serverUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    globalThis.fetch = realFetch;
    await new Promise((resolve) => ioServer.close(resolve));
    await stopDatabase();
  });
  beforeEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets = [];
    await clearDatabase();
    // Zoom is offered while the classroom integration is set to it; the credentials come from the environment.
    await SystemSettings.create({ _id: 'system', classroomIntegration: 'zoom' });
    zoom = fakeZoom();
    // Only Zoom's addresses are faked; anything else goes out as usual.
    globalThis.fetch = (input, options) => (/^https:\/\/(api\.)?zoom\.us\//.test(String(input))
      ? zoom.fetch(input, options)
      : realFetch(input, options));
  });

  it('lets the teacher add one Zoom meeting and gives students its link, telling the class live', async () => {
    const { session, classroom, teacherToken, studentToken } = await setupClass();
    const studentPage = await connect(studentToken);
    await emitAck(studentPage, 'sessions:watch');
    const told = new Promise((resolve) => studentPage.once('session:zoom-added', resolve));

    const before = await zoomLink(studentToken, session);
    assert.equal(before.status, 404);
    assert.match(before.body.message, /not opened this class in Zoom/);

    const first = await openZoom(teacherToken, session);
    assert.equal(first.status, 201);
    assert.equal(first.body.data.created, true);
    assert.match(first.body.data.url, /zak=host/);
    assert.deepEqual(await told, { sessionId: session.id, classroomId: classroom.id });

    // Asking again gives the same meeting, with a host link fetched fresh from Zoom.
    const again = await openZoom(teacherToken, session);
    assert.equal(again.status, 200);
    assert.equal(again.body.data.created, false);
    assert.equal(again.body.data.meetingId, first.body.data.meetingId);
    assert.match(again.body.data.url, /zak=fresh/);
    assert.equal(zoom.meetings.size, 1);

    const link = await zoomLink(studentToken, session);
    assert.equal(link.status, 200);
    assert.equal(link.body.data.url, `https://zoom.us/j/${first.body.data.meetingId}?pwd=secret`);
  });

  it('keeps Zoom to the people allowed into the class, on the same terms as the room', async () => {
    const { session, student, teacherToken, studentToken, outsiderToken } = await setupClass();
    assert.equal((await openZoom(studentToken, session)).status, 403);
    assert.equal((await openZoom(outsiderToken, session)).status, 403);
    await openZoom(teacherToken, session);
    assert.equal((await zoomLink(outsiderToken, session)).status, 403);

    await ClassSession.updateOne({ _id: session._id }, { $addToSet: { removedParticipants: student._id } });
    const removed = await zoomLink(studentToken, session);
    assert.equal(removed.status, 403);
    assert.match(removed.body.message, /removed/);

    await ClassSession.updateOne({ _id: session._id }, { $set: { removedParticipants: [], endedAt: new Date() } });
    assert.equal((await zoomLink(studentToken, session)).status, 403);
  });

  it('never puts the join link in session lists or the room, only whether there is a meeting', async () => {
    const { session, teacherToken, studentToken } = await setupClass();
    await openZoom(teacherToken, session);

    const room = await request(app).get(`/api/sessions/${session.id}/room`).set(auth(studentToken));
    assert.equal(room.status, 200);
    assert.equal(room.body.data.session.zoomMeeting, true);
    assert.deepEqual(room.body.data.session.zoom, { enabled: true, timeLimitMinutes: 40 });

    const lists = await Promise.all([
      request(app).get('/api/sessions').set(auth(teacherToken)),
      request(app).get('/api/sessions?view=mine').set(auth(studentToken)),
    ]);
    for (const list of lists) {
      assert.equal(list.status, 200);
      assert.equal(list.body.data.items[0].zoomMeeting, true);
    }
    for (const body of [room.body, ...lists.map((list) => list.body)]) {
      assert.equal(JSON.stringify(body).includes('pwd=secret'), false);
    }
  });

  it('refuses sessions that are over or cancelled', async () => {
    const { session, teacherToken } = await setupClass();
    await ClassSession.updateOne({ _id: session._id }, { $set: { endsAt: new Date(Date.now() - 1000) } });
    assert.equal((await openZoom(teacherToken, session)).status, 400);
    await ClassSession.updateOne({ _id: session._id }, { $set: { endsAt: new Date(Date.now() + 60_000), status: 'cancelled' } });
    assert.equal((await openZoom(teacherToken, session)).status, 400);
    assert.equal(zoom.meetings.size, 0);
  });

  it('makes a new meeting when the old one was deleted in Zoom', async () => {
    const { session, teacherToken } = await setupClass();
    const first = await openZoom(teacherToken, session);
    zoom.meetings.clear();
    const second = await openZoom(teacherToken, session);
    assert.equal(second.status, 201);
    assert.notEqual(second.body.data.meetingId, first.body.data.meetingId);
  });

  it('ends the Zoom meeting when the teacher ends the class, and deletes it when the session is cancelled', async () => {
    const { session, teacherToken } = await setupClass();
    const { body } = await openZoom(teacherToken, session);
    const meeting = zoom.meetings.get(body.data.meetingId);

    const teacherRoom = await connect(teacherToken);
    assert.ok((await emitAck(teacherRoom, 'room:join', session.id)).session);
    assert.deepEqual(await emitAck(teacherRoom, 'room:end'), { success: true });
    for (let waited = 0; !meeting.ended && waited < 1000; waited += 20) await sleep(20);
    assert.equal(meeting.ended, true);

    const cancelled = await request(app)
      .post(`/api/sessions/${session.id}/cancel`)
      .set(auth(teacherToken))
      .send({ scope: 'occurrence' });
    assert.equal(cancelled.status, 200);
    for (let waited = 0; zoom.meetings.size && waited < 1000; waited += 20) await sleep(20);
    assert.equal(zoom.meetings.size, 0);
  });

  it('uses the credentials saved in System Settings before the environment', async () => {
    const { session, teacherToken } = await setupClass();
    await SystemSettings.updateOne(
      { _id: 'system' },
      { $set: { zoom: { accountId: 'saved-account', clientId: 'saved-client', clientSecret: 'saved-secret' } } },
    );
    assert.equal((await openZoom(teacherToken, session)).status, 201);
    const signIn = zoom.calls.find(({ url }) => url.pathname === '/oauth/token');
    assert.equal(signIn.url.searchParams.get('account_id'), 'saved-account');
    assert.equal(signIn.options.headers.Authorization, `Basic ${Buffer.from('saved-client:saved-secret').toString('base64')}`);
  });

  it('offers no Zoom while the classroom integration is WebRTC, leaving the room as it is', async () => {
    const { session, teacherToken, studentToken } = await setupClass();
    await SystemSettings.updateOne({ _id: 'system' }, { $set: { classroomIntegration: 'webrtc' } });
    const room = await request(app).get(`/api/sessions/${session.id}/room`).set(auth(studentToken));
    assert.equal(room.status, 200);
    assert.deepEqual(room.body.data.session.zoom, { enabled: false });
    assert.equal((await openZoom(teacherToken, session)).status, 404);
    assert.equal(zoom.calls.length, 0);
  });

  it('says plainly when Zoom cannot be reached', async () => {
    const { session, teacherToken } = await setupClass();
    // Other credentials, so no token from an earlier test is reused.
    await SystemSettings.updateOne({ _id: 'system' }, { $set: { zoom: { accountId: 'a', clientId: 'b', clientSecret: 'c' } } });
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    const reply = await openZoom(teacherToken, session);
    assert.equal(reply.status, 503);
    assert.match(reply.body.message, /Zoom is unavailable/);
  });
});
