import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

// Zoom is set up for this file only: each test file runs in its own process.
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
const { fakeZoom } = await import('./fakeZoom.js');

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
const waitForEvent = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 2_000);
  socket.once(event, (payload) => {
    clearTimeout(timer);
    resolve(payload);
  });
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
const until = async (check) => {
  for (let waited = 0; !(await check()) && waited < 1000; waited += 20) await sleep(20);
};

async function setupClass() {
  const teacher = await createUser({ role: 'teacher' });
  const otherTeacher = await createUser({ role: 'teacher' });
  const admin = await createUser({ role: 'admin' });
  const student = await createUser({ role: 'student' });
  const outsider = await createUser({ role: 'student' });
  const classroom = await Classroom.create({
    name: 'Provider Class', teacher: teacher._id, teachers: [teacher._id], students: [student._id],
  });
  await Classroom.create({ name: 'Elsewhere', teacher: otherTeacher._id, teachers: [otherTeacher._id], students: [outsider._id] });
  const session = await ClassSession.create({
    classroom: classroom._id,
    assignedTeachers: [teacher._id],
    assignedStudents: [student._id],
    title: 'Lesson',
    startsAt: new Date(Date.now() - 5 * 60_000),
    endsAt: new Date(Date.now() + 55 * 60_000),
  });
  return {
    student, classroom, session,
    teacherToken: await login(teacher),
    otherTeacherToken: await login(otherTeacher),
    adminToken: await login(admin),
    studentToken: await login(student),
    outsiderToken: await login(outsider),
  };
}
const choose = (token, session, meetingProvider) => request(app)
  .put(`/api/sessions/${session.id ?? session._id}/meeting-provider`)
  .set(auth(token))
  .send({ meetingProvider });
const room = (token, session) => request(app).get(`/api/sessions/${session.id ?? session._id}/room`).set(auth(token));
const openZoom = (token, session) => request(app).post(`/api/sessions/${session.id ?? session._id}/zoom`).set(auth(token));
const zoomLink = (token, session) => request(app).get(`/api/sessions/${session.id ?? session._id}/zoom`).set(auth(token));
async function joinRoom(token, session) {
  const socket = await connect(token);
  return { socket, reply: await emitAck(socket, 'room:join', String(session.id ?? session._id)) };
}

before(async () => {
  await startDatabase();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  globalThis.fetch = realFetch;
  // Let the last test's room departures be recorded before the database goes.
  await Promise.all(sockets.filter((socket) => socket.connected).map((socket) => emitAck(socket, 'room:leave')));
  await new Promise((resolve) => ioServer.close(resolve));
  await stopDatabase();
});
beforeEach(async () => {
  for (const socket of sockets) socket.disconnect();
  sockets = [];
  await clearDatabase();
  await SystemSettings.create({ _id: 'system', classroomIntegration: 'zoom' });
  zoom = fakeZoom();
  globalThis.fetch = (input, options) => (/^https:\/\/(api\.)?zoom\.us\//.test(String(input))
    ? zoom.fetch(input, options)
    : realFetch(input, options));
});

describe('the class room, until a teacher chooses Zoom', () => {
  it('gives students the class room only, and refuses Zoom', async () => {
    const { session, teacherToken, studentToken } = await setupClass();
    const { body } = await room(studentToken, session);
    assert.equal(body.data.session.meetingProvider, 'builtin');
    assert.ok(body.data.session.iceServers.length > 0);

    const { reply } = await joinRoom(studentToken, session);
    assert.ok(reply.session, reply.error);

    const link = await zoomLink(studentToken, session);
    assert.equal(link.status, 409);
    assert.match(link.body.message, /held in the class room/);
    assert.equal((await openZoom(teacherToken, session)).status, 409);
    assert.equal(zoom.meetings.size, 0);

    const list = await request(app).get('/api/sessions?view=mine').set(auth(studentToken));
    assert.equal(list.body.data.items[0].meetingProvider, 'builtin');
  });
});

describe('a class the teacher moved to Zoom', () => {
  it('gives students Zoom only: no room, no relay credentials, no room files', async () => {
    const { session, classroom, teacherToken, studentToken } = await setupClass();
    const studentPage = await connect(studentToken);
    await emitAck(studentPage, 'sessions:watch');
    const told = waitForEvent(studentPage, 'session:provider-changed');

    const chosen = await choose(teacherToken, session, 'zoom');
    assert.equal(chosen.status, 200);
    assert.deepEqual(chosen.body.data, { meetingProvider: 'zoom', zoomMeeting: false });
    assert.deepEqual(await told, { sessionId: session.id, classroomId: classroom.id, meetingProvider: 'zoom' });

    const { body } = await room(studentToken, session);
    assert.equal(body.data.session.meetingProvider, 'zoom');
    assert.deepEqual(body.data.session.iceServers, []);
    assert.equal(body.data.session.iceServersWarning, null);

    const { reply } = await joinRoom(studentToken, session);
    assert.match(reply.error, /held in Zoom/);

    const upload = await request(app)
      .post(`/api/sessions/${session.id}/files`)
      .set({ ...auth(studentToken), 'Content-Type': 'application/octet-stream', 'X-File-Name': 'notes.txt' })
      .send(Buffer.from('notes'));
    assert.equal(upload.status, 409);
    // Nor can they read the room's chat or files; its teachers still can.
    assert.equal((await request(app).get(`/api/sessions/${session.id}/messages`).set(auth(studentToken))).status, 409);
    assert.equal((await request(app).get(`/api/sessions/${session.id}/files`).set(auth(studentToken))).status, 409);
    assert.equal((await request(app).get(`/api/sessions/${session.id}/messages`).set(auth(teacherToken))).status, 200);

    // Until the teacher opens the meeting there is nothing to join; then there is.
    assert.equal((await zoomLink(studentToken, session)).status, 404);
    assert.equal((await openZoom(teacherToken, session)).status, 201);
    const link = await zoomLink(studentToken, session);
    assert.equal(link.status, 200);
    assert.match(link.body.data.url, /^https:\/\/zoom\.us\/j\//);
  });

  it('sends students already in the room back to the lobby and closes their attendance', async () => {
    const { session, student, teacherToken, studentToken } = await setupClass();
    const teacherRoom = await joinRoom(teacherToken, session);
    const studentRoom = await joinRoom(studentToken, session);
    assert.ok(studentRoom.reply.session);
    const sentOut = waitForEvent(studentRoom.socket, 'room:provider-changed');
    let teacherSentOut = false;
    teacherRoom.socket.on('room:provider-changed', () => { teacherSentOut = true; });

    assert.equal((await choose(teacherToken, session, 'zoom')).status, 200);
    assert.deepEqual(await sentOut, { sessionId: session.id, meetingProvider: 'zoom' });

    const entry = (await ClassSession.findById(session._id).lean()).attendance
      .find((item) => String(item.participant) === String(student._id));
    assert.equal(entry.activeSince, undefined);
    assert.ok(entry.leftAt);
    // The teacher, who runs the class, is not sent out.
    await sleep(100);
    assert.equal(teacherSentOut, false);
  });

  it('lets the people who run the class still use either', async () => {
    const { session, teacherToken, adminToken } = await setupClass();
    await choose(teacherToken, session, 'zoom');
    assert.ok((await joinRoom(teacherToken, session)).reply.session);
    assert.ok((await joinRoom(adminToken, session)).reply.session);
    assert.ok((await room(teacherToken, session)).body.data.session.iceServers.length > 0);
  });
});

describe('moving a class back to its room', () => {
  it('deletes the Zoom meeting, so an old link or request gives no Zoom', async () => {
    const { session, teacherToken, studentToken } = await setupClass();
    await choose(teacherToken, session, 'zoom');
    const { body } = await openZoom(teacherToken, session);
    assert.equal((await zoomLink(studentToken, session)).status, 200);

    const back = await choose(teacherToken, session, 'builtin');
    assert.deepEqual(back.body.data, { meetingProvider: 'builtin', zoomMeeting: false });
    await until(() => !zoom.meetings.has(body.data.meetingId));
    assert.equal(zoom.meetings.has(body.data.meetingId), false);

    assert.equal((await zoomLink(studentToken, session)).status, 409);
    assert.equal((await room(studentToken, session)).body.data.session.zoomMeeting, false);
    assert.ok((await joinRoom(studentToken, session)).reply.session);

    // Choosing Zoom again makes a new meeting.
    await choose(teacherToken, session, 'zoom');
    const again = await openZoom(teacherToken, session);
    assert.equal(again.status, 201);
    assert.notEqual(again.body.data.meetingId, body.data.meetingId);
  });

  it('changes nothing and tells nobody when the same provider is chosen again', async () => {
    const { session, teacherToken, studentToken } = await setupClass();
    const studentPage = await connect(studentToken);
    await emitAck(studentPage, 'sessions:watch');
    let told = 0;
    studentPage.on('session:provider-changed', () => { told += 1; });
    assert.equal((await choose(teacherToken, session, 'builtin')).status, 200);
    await sleep(100);
    assert.equal(told, 0);
  });
});

describe('who chooses, and when', () => {
  it('lets only the class’s teachers and administrators choose', async () => {
    const { session, studentToken, otherTeacherToken, adminToken, outsiderToken } = await setupClass();
    assert.equal((await choose(studentToken, session, 'zoom')).status, 403);
    assert.equal((await choose(otherTeacherToken, session, 'zoom')).status, 403);
    assert.equal((await choose(adminToken, session, 'zoom')).status, 200);
    assert.equal((await zoomLink(outsiderToken, session)).status, 403);
    assert.equal((await choose(adminToken, session, 'skype')).status, 400);
  });

  it('refuses sessions that are over or cancelled', async () => {
    const { session, teacherToken } = await setupClass();
    await ClassSession.updateOne({ _id: session._id }, { $set: { endsAt: new Date(Date.now() - 1000) } });
    assert.equal((await choose(teacherToken, session, 'zoom')).status, 400);
    await ClassSession.updateOne({ _id: session._id }, { $set: { endsAt: new Date(Date.now() + 60_000), status: 'cancelled' } });
    assert.equal((await choose(teacherToken, session, 'zoom')).status, 400);
  });
});

describe('attendance in a class held in Zoom', () => {
  /** A class held in Zoom, starting `startsInMs` from now, with its meeting open and two students. */
  async function zoomClass(startsInMs) {
    const setup = await setupClass();
    const absentee = await createUser({ role: 'student' });
    await Classroom.updateOne({ _id: setup.classroom._id }, { $push: { students: absentee._id } });
    await ClassSession.updateOne({ _id: setup.session._id }, {
      $set: {
        startsAt: new Date(Date.now() + startsInMs),
        endsAt: new Date(Date.now() + startsInMs + 60 * 60_000),
        assignedStudents: [setup.student._id, absentee._id],
      },
    });
    await choose(setup.teacherToken, setup.session, 'zoom');
    await openZoom(setup.teacherToken, setup.session);
    return { ...setup, absentee, absenteeToken: await login(absentee) };
  }
  const entryOf = async (session, person) => (await ClassSession.findById(session._id).lean()).attendance
    .find((item) => String(item.participant) === String(person._id));

  it('checks students in when they open Join in Zoom, once, recording arrival but no time', async () => {
    const { session, student, studentToken } = await zoomClass(-60_000);
    assert.equal((await zoomLink(studentToken, session)).status, 200);
    const first = await entryOf(session, student);
    assert.equal(first.status, 'present');
    assert.ok(first.checkInAt);
    assert.equal(first.durationMs, 0);
    assert.equal(first.activeSince, undefined);

    await sleep(20);
    await zoomLink(studentToken, session);
    const entries = (await ClassSession.findById(session._id).lean()).attendance
      .filter((item) => String(item.participant) === String(student._id));
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].checkInAt, first.checkInAt);
  });

  it('marks a late arrival late, and counts opening Zoom shortly before the start as arriving at the start', async () => {
    const late = await zoomClass(-10 * 60_000);
    await zoomLink(late.studentToken, late.session);
    assert.equal((await entryOf(late.session, late.student)).status, 'late');

    await clearDatabase();
    await SystemSettings.create({ _id: 'system', classroomIntegration: 'zoom' });
    const early = await zoomClass(10 * 60_000);
    await zoomLink(early.studentToken, early.session);
    const entry = await entryOf(early.session, early.student);
    assert.equal(entry.status, 'present');
    const { startsAt } = await ClassSession.findById(early.session._id).lean();
    assert.deepEqual(entry.checkInAt, startsAt);

    await clearDatabase();
    await SystemSettings.create({ _id: 'system', classroomIntegration: 'zoom' });
    const tooEarly = await zoomClass(30 * 60_000);
    assert.equal((await zoomLink(tooEarly.studentToken, tooEarly.session)).status, 200);
    assert.equal(await entryOf(tooEarly.session, tooEarly.student), undefined);
  });

  it('checks in the teacher who opens the meeting', async () => {
    const { session, teacherToken } = await zoomClass(-60_000);
    await openZoom(teacherToken, session);
    const { attendance } = await ClassSession.findById(session._id).lean();
    assert.ok(attendance.some((item) => item.role === 'teacher' && item.status === 'present'));
  });

  it('marks nobody absent after it ends, leaving it to the teacher, unlike the class room', async () => {
    const { session, student, absentee, studentToken, absenteeToken, teacherToken } = await zoomClass(-60_000);
    await zoomLink(studentToken, session);
    await ClassSession.updateOne({ _id: session._id }, { $set: { endsAt: new Date(Date.now() - 1000) } });

    const { body } = await request(app).get(`/api/sessions/${session.id}/attendance`).set(auth(teacherToken));
    const statusOf = (person) => body.data.items.find((item) => item.participant.id === String(person._id)).status;
    assert.equal(statusOf(student), 'present');
    assert.equal(statusOf(absentee), null);
    assert.equal(await entryOf(session, absentee), undefined);
    const list = await request(app).get('/api/sessions?view=mine').set(auth(absenteeToken));
    assert.equal(list.body.data.items.find((item) => item.id === session.id).attendance.status, null);

    // The teacher marks the absence.
    const marked = await request(app)
      .patch(`/api/sessions/${session.id}/attendance/${absentee._id}`)
      .set(auth(teacherToken))
      .send({ status: 'absent' });
    assert.equal(marked.status, 200);
    assert.equal((await entryOf(session, absentee)).status, 'absent');

    // A class held in its room still marks absences by itself.
    await ClassSession.updateOne({ _id: session._id }, { $set: { meetingProvider: 'builtin' }, $pull: { attendance: { participant: absentee._id } } });
    const roomBody = (await request(app).get(`/api/sessions/${session.id}/attendance`).set(auth(teacherToken))).body;
    assert.equal(roomBody.data.items.find((item) => item.participant.id === String(absentee._id)).status, 'absent');
  });
});

describe('sessions with no valid choice', () => {
  it('are held in the class room, never both, even with a Zoom meeting left from before', async () => {
    const { classroom, teacherToken, studentToken } = await setupClass();
    const [studentId] = classroom.students;
    // Written straight to the collection, as a record from before the choice existed.
    const { insertedId } = await ClassSession.collection.insertOne({
      classroom: classroom._id,
      assignedTeachers: classroom.teachers,
      assignedStudents: [studentId],
      title: 'Older lesson',
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
      status: 'scheduled',
      attendance: [],
      zoomMeeting: { meetingId: '81000000999', joinUrl: 'https://zoom.us/j/81000000999?pwd=old' },
    });
    const legacy = { _id: insertedId };
    assert.equal((await room(studentToken, legacy)).body.data.session.meetingProvider, 'builtin');
    assert.equal((await zoomLink(studentToken, legacy)).status, 409);
    assert.ok((await joinRoom(studentToken, legacy)).reply.session);

    await ClassSession.collection.updateOne({ _id: insertedId }, { $set: { meetingProvider: 'skype' } });
    assert.equal((await room(teacherToken, legacy)).body.data.session.meetingProvider, 'builtin');
    assert.equal((await zoomLink(studentToken, legacy)).status, 409);
  });

  it('stay in Zoom when Zoom is switched off, without opening the room to students', async () => {
    const { session, teacherToken, studentToken } = await setupClass();
    await choose(teacherToken, session, 'zoom');
    const { body: opened } = await openZoom(teacherToken, session);
    await SystemSettings.updateOne({ _id: 'system' }, { $set: { classroomIntegration: 'webrtc' } });

    const { body } = await room(studentToken, session);
    assert.equal(body.data.session.meetingProvider, 'zoom');
    assert.deepEqual(body.data.session.zoom, { enabled: false });
    assert.match((await joinRoom(studentToken, session)).reply.error, /held in Zoom/);
    assert.equal((await zoomLink(studentToken, session)).status, 404);

    // The teacher cannot choose Zoom now, but can move the class back to its room.
    assert.equal((await choose(teacherToken, session, 'zoom')).status, 404);
    assert.equal((await choose(teacherToken, session, 'builtin')).status, 200);
    assert.ok((await joinRoom(studentToken, session)).reply.session);
    // Its Zoom meeting is still deleted, though Zoom is off, so the old link stops working.
    await until(() => !zoom.meetings.has(opened.data.meetingId));
    assert.equal(zoom.meetings.has(opened.data.meetingId), false);
  });
});
