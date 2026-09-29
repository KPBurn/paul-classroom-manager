import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { io as createClient } from 'socket.io-client';
import { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';
import { Classroom } from '../src/models/Classroom.js';
import { ClassSession } from '../src/models/ClassSession.js';
import { SessionFile } from '../src/models/SessionFile.js';
import { attachSessionSocket } from '../src/realtime/sessionSocket.js';

const app = createApp();
const server = createServer(app);
const ioServer = attachSessionSocket(server);
let serverUrl;

const login = async (user) => {
  const response = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(response.status, 200);
  return response.body.data.token;
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const waitForConnect = (socket) => new Promise((resolve, reject) => {
  socket.once('connect', resolve);
  socket.once('connect_error', reject);
});
const emitAck = (socket, event, ...args) => new Promise((resolve) => {
  socket.emit(event, ...args, resolve);
});

before(async () => {
  await startDatabase();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => ioServer.close(resolve));
  await stopDatabase();
});
beforeEach(clearDatabase);

async function setupRoom() {
  const teacher = await createUser({ role: 'teacher' });
  const coTeacher = await createUser({ role: 'teacher' });
  const student = await createUser({ role: 'student' });
  const unrelated = await createUser({ role: 'student' });
  const admin = await createUser({ role: 'admin' });
  const classroom = await Classroom.create({
    name: 'Session Room',
    teacher: teacher._id,
    teachers: [teacher._id, coTeacher._id],
    students: [student._id],
  });
  const session = await ClassSession.create({
    classroom: classroom._id,
    title: 'Room Test',
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 60_000),
  });
  const teacherToken = await login(teacher);
  const coTeacherToken = await login(coTeacher);
  const studentToken = await login(student);
  const unrelatedToken = await login(unrelated);
  const adminToken = await login(admin);
  const teacherSocket = createClient(serverUrl, { auth: { token: teacherToken }, reconnection: false });
  const coTeacherSocket = createClient(serverUrl, { auth: { token: coTeacherToken }, reconnection: false });
  const studentSocket = createClient(serverUrl, { auth: { token: studentToken }, reconnection: false });
  const unrelatedSocket = createClient(serverUrl, { auth: { token: unrelatedToken }, reconnection: false });
  const adminSocket = createClient(serverUrl, { auth: { token: adminToken }, reconnection: false });
  await Promise.all([
    waitForConnect(teacherSocket),
    waitForConnect(coTeacherSocket),
    waitForConnect(studentSocket),
    waitForConnect(unrelatedSocket),
    waitForConnect(adminSocket),
  ]);
  return {
    session,
    classroom,
    student,
    teacherSocket,
    coTeacherSocket,
    studentSocket,
    unrelatedSocket,
    adminSocket,
    unrelatedToken,
    studentToken,
    adminToken,
    cleanup: () => {
      teacherSocket.disconnect();
      coTeacherSocket.disconnect();
      studentSocket.disconnect();
      unrelatedSocket.disconnect();
      adminSocket.disconnect();
    },
  };
}

describe('session room collaboration', () => {
  it('authorizes participants, persists chat, and reports microphone state', async () => {
    const {
      session,
      teacherSocket,
      studentSocket,
      unrelatedSocket,
      adminSocket,
      unrelatedToken,
      studentToken,
      adminToken,
      cleanup,
    } = await setupRoom();
    try {
      const teacherJoin = await emitAck(teacherSocket, 'room:join', String(session._id));
      assert.equal(teacherJoin.session.title, 'Room Test');
      const studentJoin = await emitAck(studentSocket, 'room:join', String(session._id));
      assert.equal(studentJoin.participants.length, 1);
      assert.equal(studentJoin.participants[0].role, 'teacher');
      const unauthorizedJoin = await emitAck(unrelatedSocket, 'room:join', String(session._id));
      assert.equal(unauthorizedJoin.error, 'You are not assigned to this classroom');
      const unauthorizedAdminJoin = await emitAck(adminSocket, 'room:join', String(session._id));
      assert.equal(unauthorizedAdminJoin.error, 'You are not assigned to this classroom');

      const updatedParticipant = new Promise((resolve) => {
        teacherSocket.once('room:participant-updated', resolve);
      });
      assert.deepEqual(await emitAck(studentSocket, 'room:microphone', false), { success: true });
      assert.equal((await updatedParticipant).muted, false);

      const sent = await emitAck(studentSocket, 'room:message', { body: '  Hello class  ' });
      assert.equal(sent.message.body, 'Hello class');
      const history = await request(app)
        .get(`/api/sessions/${session.id}/messages`)
        .set(auth(studentToken));
      assert.equal(history.status, 200);
      assert.equal(history.body.data.items.length, 1);
      assert.equal(history.body.data.items[0].sender.role, 'student');
      assert.equal(history.body.data.items[0].body, 'Hello class');

      const forbidden = await request(app)
        .get(`/api/sessions/${session.id}/messages`)
        .set(auth(unrelatedToken));
      assert.equal(forbidden.status, 403);
      const forbiddenRoom = await request(app)
        .get(`/api/sessions/${session.id}/room`)
        .set(auth(adminToken));
      assert.equal(forbiddenRoom.status, 403);
      const invalidMessage = await emitAck(studentSocket, 'room:message', { body: '   ' });
      assert.ok(invalidMessage.error);
    } finally {
      cleanup();
    }
  });

  it('allows every active role into explicitly open classroom rooms', async () => {
    const {
      session,
      classroom,
      teacherSocket,
      studentSocket,
      unrelatedSocket,
      adminSocket,
      adminToken,
      cleanup,
    } = await setupRoom();
    try {
      classroom.openAccess = true;
      await classroom.save();

      const joins = await Promise.all([
        emitAck(teacherSocket, 'room:join', String(session._id)),
        emitAck(studentSocket, 'room:join', String(session._id)),
        emitAck(unrelatedSocket, 'room:join', String(session._id)),
        emitAck(adminSocket, 'room:join', String(session._id)),
      ]);
      assert.ok(joins.every((result) => !result.error));
      const allParticipants = await emitAck(adminSocket, 'room:join', String(session._id));
      assert.equal(allParticipants.participants.length, 4);

      const room = await request(app)
        .get(`/api/sessions/${session.id}/room`)
        .set(auth(adminToken));
      assert.equal(room.status, 200);
      assert.equal(room.body.data.session.classroom.openAccess, true);

      const adminHistory = await request(app)
        .get(`/api/sessions/${session.id}/messages`)
        .set(auth(adminToken));
      assert.equal(adminHistory.status, 200);

      const adminSessions = await request(app)
        .get('/api/sessions')
        .set(auth(adminToken));
      assert.equal(adminSessions.status, 200);
      assert.equal(adminSessions.body.data.items[0].id, String(session._id));
    } finally {
      cleanup();
    }
  });

  it('allows only one participant to share a screen at a time', async () => {
    const { session, teacherSocket, studentSocket, cleanup } = await setupRoom();
    try {
      await Promise.all([
        emitAck(teacherSocket, 'room:join', String(session._id)),
        emitAck(studentSocket, 'room:join', String(session._id)),
      ]);

      assert.deepEqual(await emitAck(teacherSocket, 'room:screen-start'), { success: true });
      const busy = await emitAck(studentSocket, 'room:screen-start');
      assert.equal(busy.error, 'Someone is already sharing their screen');
      assert.deepEqual(await emitAck(teacherSocket, 'room:screen-stop'), { success: true });
      assert.deepEqual(await emitAck(studentSocket, 'room:screen-start'), { success: true });
    } finally {
      cleanup();
    }
  });

  it('lets the assigned teacher independently control screen sharing and temporary file uploads', async () => {
    const {
      session,
      student,
      teacherSocket,
      coTeacherSocket,
      studentSocket,
      unrelatedToken,
      studentToken,
      cleanup,
    } = await setupRoom();
    try {
      const teacherJoin = await emitAck(teacherSocket, 'room:join', String(session._id));
      const coTeacherJoin = await emitAck(coTeacherSocket, 'room:join', String(session._id));
      await emitAck(studentSocket, 'room:join', String(session._id));
      assert.equal(teacherJoin.canManageRoom, true);
      assert.equal(coTeacherJoin.canManageRoom, true);

      assert.deepEqual(await emitAck(studentSocket, 'room:settings-update', { screenSharingEnabled: false }), {
        error: 'You are not assigned to this classroom',
      });
      assert.deepEqual(await emitAck(studentSocket, 'room:screen-start'), { success: true });
      const screenStopped = new Promise((resolve) => studentSocket.once('room:screen-sharing', resolve));
      const sharingSettings = await emitAck(coTeacherSocket, 'room:settings-update', { screenSharingEnabled: false });
      assert.deepEqual(sharingSettings.roomSettings, { screenSharingEnabled: false, fileUploadsEnabled: true });
      assert.deepEqual(await screenStopped, { participantId: studentSocket.id, sharing: false });
      assert.equal((await emitAck(studentSocket, 'room:screen-start')).error, 'Screen sharing is disabled by the teacher');

      await emitAck(coTeacherSocket, 'room:settings-update', { fileUploadsEnabled: false });
      const disabledUpload = await request(app)
        .post(`/api/sessions/${session.id}/files`)
        .set(auth(studentToken))
        .set('Content-Type', 'application/octet-stream')
        .set('X-File-Name', 'lesson.txt')
        .send(Buffer.from('class notes'));
      assert.equal(disabledUpload.status, 403);

      const uploadSettings = await emitAck(coTeacherSocket, 'room:settings-update', { fileUploadsEnabled: true });
      assert.deepEqual(uploadSettings.roomSettings, { screenSharingEnabled: false, fileUploadsEnabled: true });
      const uploaded = await request(app)
        .post(`/api/sessions/${session.id}/files`)
        .set(auth(studentToken))
        .set('Content-Type', 'application/octet-stream')
        .set('X-File-Name', 'lesson%20notes.txt')
        .send(Buffer.from('class notes'));
      assert.equal(uploaded.status, 201);
      assert.equal(uploaded.body.data.file.name, 'lesson notes.txt');

      const listed = await request(app)
        .get(`/api/sessions/${session.id}/files`)
        .set(auth(studentToken));
      assert.equal(listed.status, 200);
      assert.equal(listed.body.data.items.length, 1);
      assert.equal(listed.body.data.items[0].uploader.name, `${student.firstName} ${student.lastName}`);

      const downloaded = await request(app)
        .get(`/api/sessions/${session.id}/files/${uploaded.body.data.file.id}`)
        .set(auth(studentToken));
      assert.equal(downloaded.status, 200);
      assert.equal(downloaded.headers['content-type'], 'application/octet-stream');
      assert.deepEqual(downloaded.body, Buffer.from('class notes'));

      const forbidden = await request(app)
        .get(`/api/sessions/${session.id}/files`)
        .set(auth(unrelatedToken));
      assert.equal(forbidden.status, 403);

      session.endsAt = new Date(Date.now() - 1000);
      await session.save();
      const endedFiles = await request(app)
        .get(`/api/sessions/${session.id}/files`)
        .set(auth(studentToken));
      assert.equal(endedFiles.status, 200);
      assert.deepEqual(endedFiles.body.data.items, []);
      assert.equal(await SessionFile.countDocuments({ session: session._id }), 0);
    } finally {
      cleanup();
    }
  });
});
