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
const waitForEvent = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 1_000);
  socket.once(event, (payload) => {
    clearTimeout(timer);
    resolve(payload);
  });
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
    teacher,
    student,
    unrelated,
    teacherSocket,
    coTeacherSocket,
    studentSocket,
    unrelatedSocket,
    adminSocket,
    unrelatedToken,
    studentToken,
    adminToken,
    cleanup: async () => {
      await Promise.all([
        teacherSocket,
        coTeacherSocket,
        studentSocket,
        unrelatedSocket,
        adminSocket,
      ].filter((socket) => socket.connected).map((socket) => emitAck(socket, 'room:leave')));
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
      teacher,
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
      const relayedSignal = new Promise((resolve) => studentSocket.once('rtc:signal', resolve));
      const signalAck = await emitAck(teacherSocket, 'rtc:signal', {
        target: studentSocket.id,
        candidate: { candidate: 'candidate:1 1 UDP 1 192.0.2.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
      });
      assert.deepEqual(signalAck, { success: true });
      assert.equal((await relayedSignal).from, teacherSocket.id);
      const unauthorizedJoin = await emitAck(unrelatedSocket, 'room:join', String(session._id));
      assert.equal(unauthorizedJoin.error, 'You are not assigned to this classroom');
      const unauthorizedAdminJoin = await emitAck(adminSocket, 'room:join', String(session._id));
      assert.equal(unauthorizedAdminJoin.session.title, 'Room Test');
      assert.equal(unauthorizedAdminJoin.canManageRoom, true);

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

      const attendance = await request(app)
        .get(`/api/sessions/${session.id}/attendance`)
        .set(auth(await login(teacher)));
      assert.equal(attendance.status, 200);
      const teacherAttendance = attendance.body.data.items.find(({ participant }) => participant.id === teacher.id);
      const studentAttendance = attendance.body.data.items.find(({ participant }) => participant.id === history.body.data.items[0].sender.id);
      assert.equal(teacherAttendance.status, 'present');
      assert.ok(teacherAttendance.checkInAt);
      assert.equal(studentAttendance.status, 'present');
      assert.ok(studentAttendance.checkInAt);

      const forbidden = await request(app)
        .get(`/api/sessions/${session.id}/messages`)
        .set(auth(unrelatedToken));
      assert.equal(forbidden.status, 403);
      const adminRoom = await request(app)
        .get(`/api/sessions/${session.id}/room`)
        .set(auth(adminToken));
      assert.equal(adminRoom.status, 200);
      assert.equal(adminRoom.body.data.session.canManageRoom, true);
      const invalidMessage = await emitAck(studentSocket, 'room:message', { body: '   ' });
      assert.ok(invalidMessage.error);
    } finally {
      await cleanup();
    }
  });

  it('relays speaking state to the room and clears it when muted', async () => {
    const { session, teacherSocket, studentSocket, unrelatedSocket, cleanup } = await setupRoom();
    try {
      await emitAck(teacherSocket, 'room:join', String(session._id));
      await emitAck(studentSocket, 'room:join', String(session._id));

      assert.ok((await emitAck(studentSocket, 'room:speaking', true)).error);
      assert.ok((await emitAck(unrelatedSocket, 'room:speaking', false)).error);

      assert.deepEqual(await emitAck(studentSocket, 'room:microphone', false), { success: true });
      const started = waitForEvent(teacherSocket, 'room:participant-speaking');
      assert.deepEqual(await emitAck(studentSocket, 'room:speaking', true), { success: true });
      assert.deepEqual(await started, { participantId: studentSocket.id, speaking: true });

      const stopped = waitForEvent(teacherSocket, 'room:participant-speaking');
      assert.deepEqual(await emitAck(studentSocket, 'room:microphone', true), { success: true });
      assert.deepEqual(await stopped, { participantId: studentSocket.id, speaking: false });
      assert.ok((await emitAck(studentSocket, 'room:speaking', true)).error);

      await emitAck(studentSocket, 'room:microphone', false);
      const speakingBeforeLeave = waitForEvent(teacherSocket, 'room:participant-speaking');
      await emitAck(studentSocket, 'room:speaking', true);
      assert.deepEqual(await speakingBeforeLeave, { participantId: studentSocket.id, speaking: true });
      const stoppedOnLeave = waitForEvent(teacherSocket, 'room:participant-speaking');
      assert.deepEqual(await emitAck(studentSocket, 'room:leave'), { success: true });
      assert.deepEqual(await stoppedOnLeave, { participantId: studentSocket.id, speaking: false });

      await emitAck(studentSocket, 'room:join', String(session._id));
      await emitAck(studentSocket, 'room:microphone', false);
      const speakingBeforeDisconnect = waitForEvent(teacherSocket, 'room:participant-speaking');
      await emitAck(studentSocket, 'room:speaking', true);
      assert.deepEqual(await speakingBeforeDisconnect, { participantId: studentSocket.id, speaking: true });
      const stoppedOnDisconnect = waitForEvent(teacherSocket, 'room:participant-speaking');
      const disconnectedParticipantId = studentSocket.id;
      studentSocket.disconnect();
      assert.deepEqual(await stoppedOnDisconnect, { participantId: disconnectedParticipantId, speaking: false });
    } finally {
      await cleanup();
    }
  });

  it('broadcasts camera state so participants can distinguish a missing feed from a camera that is off', async () => {
    const { session, teacherSocket, studentSocket, unrelatedSocket, cleanup } = await setupRoom();
    try {
      await emitAck(teacherSocket, 'room:join', String(session._id));
      await emitAck(studentSocket, 'room:join', String(session._id));

      assert.ok((await emitAck(unrelatedSocket, 'room:camera', true)).error);
      const cameraOn = waitForEvent(teacherSocket, 'room:participant-updated');
      assert.deepEqual(await emitAck(studentSocket, 'room:camera', true), { success: true });
      assert.equal((await cameraOn).cameraEnabled, true);

      const cameraOff = waitForEvent(teacherSocket, 'room:participant-updated');
      assert.deepEqual(await emitAck(studentSocket, 'room:camera', false), { success: true });
      assert.equal((await cameraOff).cameraEnabled, false);
    } finally {
      await cleanup();
    }
  });

  it('allows every active role into explicitly open classroom rooms', async () => {
    const {
      session,
      classroom,
      teacherSocket,
      studentSocket,
      unrelatedSocket,
      unrelated,
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
      await emitAck(unrelatedSocket, 'room:leave');

      const room = await request(app)
        .get(`/api/sessions/${session.id}/room`)
        .set(auth(adminToken));
      assert.equal(room.status, 200);
      assert.equal(room.body.data.session.classroom.openAccess, true);
      assert.ok(room.body.data.session.iceServers.some(({ urls }) => urls === 'stun:stun.l.google.com:19302'));
      assert.match(room.body.data.session.iceServersWarning, /No TURN relay is configured/);

      const adminHistory = await request(app)
        .get(`/api/sessions/${session.id}/messages`)
        .set(auth(adminToken));
      assert.equal(adminHistory.status, 200);
      const systemMessages = adminHistory.body.data.items.filter(({ type }) => type === 'system');
      assert.ok(systemMessages.some(({ body }) => body === `${unrelated.firstName} ${unrelated.lastName} joined the classroom`));
      assert.ok(systemMessages.some(({ body }) => body === `${unrelated.firstName} ${unrelated.lastName} left the classroom`));

      const adminSessions = await request(app)
        .get('/api/sessions')
        .set(auth(adminToken));
      assert.equal(adminSessions.status, 200);
      assert.equal(adminSessions.body.data.items[0].id, String(session._id));
    } finally {
      await cleanup();
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
      await cleanup();
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
      await cleanup();
    }
  });
});

describe('teacher room moderation', () => {
  it('lets the teacher mute students but not teachers, and not the other way round', async () => {
    const { session, teacherSocket, coTeacherSocket, studentSocket, cleanup } = await setupRoom();
    try {
      const sessionId = String(session._id);
      await emitAck(teacherSocket, 'room:join', sessionId);
      await emitAck(coTeacherSocket, 'room:join', sessionId);
      await emitAck(studentSocket, 'room:join', sessionId);
      await emitAck(studentSocket, 'room:microphone', false);

      const studentMute = await emitAck(studentSocket, 'room:mute-participant', teacherSocket.id);
      assert.equal(studentMute.error, 'Only the class teacher can do that');
      const teacherMute = await emitAck(teacherSocket, 'room:mute-participant', coTeacherSocket.id);
      assert.equal(teacherMute.error, 'Teachers cannot be moderated');

      const forceMuted = waitForEvent(studentSocket, 'room:force-muted');
      const updated = waitForEvent(teacherSocket, 'room:participant-updated');
      assert.deepEqual(await emitAck(teacherSocket, 'room:mute-participant', studentSocket.id), { success: true });
      assert.ok((await forceMuted).by);
      assert.equal((await updated).muted, true);

      await emitAck(studentSocket, 'room:microphone', false);
      const mutedAgain = waitForEvent(studentSocket, 'room:force-muted');
      assert.deepEqual(await emitAck(teacherSocket, 'room:mute-all'), { success: true });
      await mutedAgain;
    } finally {
      await cleanup();
    }
  });

  it('removes a participant until the teacher allows them back', async () => {
    const { session, student, teacherSocket, studentSocket, studentToken, cleanup } = await setupRoom();
    try {
      const sessionId = String(session._id);
      await emitAck(teacherSocket, 'room:join', sessionId);
      await emitAck(studentSocket, 'room:join', sessionId);

      const removed = waitForEvent(studentSocket, 'room:removed');
      const left = waitForEvent(teacherSocket, 'room:participant-left');
      const result = await emitAck(teacherSocket, 'room:remove-participant', studentSocket.id);
      assert.equal(result.success, true);
      assert.deepEqual(result.removedParticipants.map((person) => person.userId), [String(student._id)]);
      await removed;
      await left;

      const rejoin = await emitAck(studentSocket, 'room:join', sessionId);
      assert.equal(rejoin.error, 'You were removed from this class by the teacher.');
      const roomPage = await request(app).get(`/api/sessions/${sessionId}/room`).set(auth(studentToken));
      assert.equal(roomPage.status, 403);

      const readmitted = await emitAck(teacherSocket, 'room:readmit-participant', String(student._id));
      assert.deepEqual(readmitted.removedParticipants, []);
      const back = await emitAck(studentSocket, 'room:join', sessionId);
      assert.equal(back.error, undefined);
    } finally {
      await cleanup();
    }
  });

  it('ends the class for everyone and keeps students out until a teacher reopens it', async () => {
    const { session, teacherSocket, studentSocket, cleanup } = await setupRoom();
    try {
      const sessionId = String(session._id);
      await emitAck(teacherSocket, 'room:join', sessionId);
      await emitAck(studentSocket, 'room:join', sessionId);

      const studentEnded = waitForEvent(studentSocket, 'room:ended');
      const teacherEnded = waitForEvent(teacherSocket, 'room:ended');
      assert.deepEqual(await emitAck(teacherSocket, 'room:end'), { success: true });
      await Promise.all([studentEnded, teacherEnded]);
      assert.ok((await ClassSession.findById(sessionId)).endedAt);

      const blocked = await emitAck(studentSocket, 'room:join', sessionId);
      assert.equal(blocked.error, 'The teacher has ended this class.');

      const teacherBack = await emitAck(teacherSocket, 'room:join', sessionId);
      assert.equal(teacherBack.classEnded, true);
      assert.deepEqual(await emitAck(teacherSocket, 'room:reopen'), { success: true });
      const studentBack = await emitAck(studentSocket, 'room:join', sessionId);
      assert.equal(studentBack.error, undefined);
    } finally {
      await cleanup();
    }
  });
});

describe('live room state and account changes', () => {
  it('tells someone who joins late who is already speaking', async () => {
    const { session, teacherSocket, studentSocket, cleanup } = await setupRoom();
    try {
      await emitAck(studentSocket, 'room:join', String(session._id));
      await emitAck(studentSocket, 'room:microphone', false);
      await emitAck(studentSocket, 'room:speaking', true);

      const speaking = await emitAck(teacherSocket, 'room:join', String(session._id));
      assert.equal(speaking.participants.find(({ id }) => id === studentSocket.id).speaking, true);

      await emitAck(teacherSocket, 'room:leave');
      await emitAck(studentSocket, 'room:speaking', false);
      const quiet = await emitAck(teacherSocket, 'room:join', String(session._id));
      assert.equal(quiet.participants.find(({ id }) => id === studentSocket.id).speaking, false);
    } finally {
      await cleanup();
    }
  });

  it('removes a deactivated user from the room straight away', async () => {
    const { session, student, teacherSocket, studentSocket, adminToken, cleanup } = await setupRoom();
    try {
      await emitAck(teacherSocket, 'room:join', String(session._id));
      await emitAck(studentSocket, 'room:join', String(session._id));
      const studentSocketId = studentSocket.id;
      const left = waitForEvent(teacherSocket, 'room:participant-left');
      const signedOut = waitForEvent(studentSocket, 'room:signed-out');
      const disconnected = waitForEvent(studentSocket, 'disconnect');

      const res = await request(app)
        .patch(`/api/users/${student.id}`)
        .set(auth(adminToken))
        .send({ status: 'suspended' });

      assert.equal(res.status, 200);
      assert.match((await signedOut).message, /no longer active/);
      assert.deepEqual(await left, { participantId: studentSocketId });
      await disconnected;
      assert.equal(studentSocket.connected, false);
      // The teacher is unaffected.
      assert.equal(teacherSocket.connected, true);
    } finally {
      await cleanup();
    }
  });

  it('ends a user’s room connection when their password is reset', async () => {
    const { session, student, studentSocket, adminToken, cleanup } = await setupRoom();
    try {
      await emitAck(studentSocket, 'room:join', String(session._id));
      const signedOut = waitForEvent(studentSocket, 'room:signed-out');

      const res = await request(app)
        .put(`/api/users/${student.id}/password`)
        .set(auth(adminToken))
        .send({ password: 'NewPassword123' });

      assert.equal(res.status, 200);
      assert.match((await signedOut).message, /password was reset/);
    } finally {
      await cleanup();
    }
  });
});
