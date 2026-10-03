import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import request from 'supertest';
import { io as createClient } from 'socket.io-client';
import { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';
import { Classroom } from '../src/models/Classroom.js';
import { ClassSession } from '../src/models/ClassSession.js';
import { attachSessionSocket } from '../src/realtime/sessionSocket.js';
import { closeInterruptedAttendance, recordRoomJoin, recordRoomLeave } from '../src/services/session.service.js';

const app = createApp();
const server = createServer(app);
const ioServer = attachSessionSocket(server);
let serverUrl;
let sockets = [];

const login = async (user) => {
  const response = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(response.status, 200);
  return response.body.data.token;
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const emitAck = (socket, event, ...args) => new Promise((resolve) => {
  socket.emit(event, ...args, resolve);
});
const waitForEvent = (socket, event, matches = () => true) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    socket.off(event, listener);
    reject(new Error(`Timed out waiting for ${event}`));
  }, 2_000);
  function listener(payload) {
    if (!matches(payload)) return;
    clearTimeout(timer);
    socket.off(event, listener);
    resolve(payload);
  }
  socket.on(event, listener);
});
/** Resolves with the events of that name that arrive within `ms`. */
const collect = async (socket, event, ms = 300) => {
  const received = [];
  const listener = (payload) => received.push(payload);
  socket.on(event, listener);
  await sleep(ms);
  socket.off(event, listener);
  return received;
};

async function connect(token) {
  const socket = createClient(serverUrl, { auth: { token }, reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}
/** A connection that follows its classrooms, as every signed-in page does. */
async function watch(token) {
  const socket = await connect(token);
  const reply = await emitAck(socket, 'sessions:watch');
  return { socket, presence: reply.presence };
}
const attendanceOf = async (sessionId, user) => (await ClassSession.findById(sessionId).lean())
  .attendance.filter((entry) => String(entry.participant) === String(user._id));

before(async () => {
  await startDatabase();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => ioServer.close(resolve));
  await stopDatabase();
});
beforeEach(async () => {
  await Promise.all(sockets.filter((socket) => socket.connected).map((socket) => emitAck(socket, 'room:leave')));
  for (const socket of sockets) socket.disconnect();
  sockets = [];
  await clearDatabase();
});

async function setupClass({ students: studentCount = 1 } = {}) {
  const teacher = await createUser({ role: 'teacher' });
  const otherTeacher = await createUser({ role: 'teacher' });
  const students = await Promise.all(Array.from({ length: studentCount }, () => createUser({ role: 'student' })));
  const outsider = await createUser({ role: 'student' });
  const classroom = await Classroom.create({
    name: 'Live Class',
    teacher: teacher._id,
    teachers: [teacher._id],
    students: students.map(({ _id }) => _id),
  });
  // A classroom the outsider does belong to, so they are a real student of the school.
  await Classroom.create({ name: 'Elsewhere', teacher: otherTeacher._id, teachers: [otherTeacher._id], students: [outsider._id] });
  return { teacher, otherTeacher, students, student: students[0], outsider, classroom };
}
const schedule = (classroom, startsInMs, lengthMs = 60 * 60_000) => ClassSession.create({
  classroom: classroom._id,
  title: 'Scheduled lesson',
  startsAt: new Date(Date.now() + startsInMs),
  endsAt: new Date(Date.now() + startsInMs + lengthMs),
});
const startNow = (token, classroom, body = {}) => request(app)
  .post('/api/sessions/start')
  .set(auth(token))
  .send({ classroomId: classroom.id, ...body });

describe('starting a class now', () => {
  it('starts a live session without a date and tells the class without a refresh', async () => {
    const { teacher, student, outsider, classroom } = await setupClass();
    const teacherToken = await login(teacher);
    const studentFeed = await watch(await login(student));
    const outsiderFeed = await watch(await login(outsider));
    assert.deepEqual(studentFeed.presence, []);

    const started = waitForEvent(studentFeed.socket, 'session:started');
    const leaked = collect(outsiderFeed.socket, 'session:started');
    const before = Date.now();
    const response = await startNow(teacherToken, classroom);

    assert.equal(response.status, 201);
    assert.equal(response.body.data.created, true);
    const { session } = response.body.data;
    assert.equal(session.title, 'Live Class class');
    assert.ok(new Date(session.startsAt).getTime() >= before - 1_000 && new Date(session.startsAt).getTime() <= Date.now());
    assert.equal(new Date(session.endsAt) - new Date(session.startsAt), 60 * 60_000);
    assert.equal(session.assignments.students.length, 1);

    const event = await started;
    assert.equal(event.session.id, session.id);
    assert.equal(event.session.classroom.id, classroom.id);
    assert.equal(event.by.id, teacher.id);
    assert.equal(event.session.attendance.status, null);
    assert.deepEqual(await leaked, []);

    // The student can go straight in.
    const joined = await emitAck(studentFeed.socket, 'room:join', session.id);
    assert.equal(joined.session.title, 'Live Class class');
  });

  it('gives the same session back when asked again, even at the same moment', async () => {
    const { teacher, classroom } = await setupClass();
    const token = await login(teacher);
    const responses = await Promise.all([startNow(token, classroom), startNow(token, classroom), startNow(token, classroom)]);
    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 200, 201]);
    assert.equal(new Set(responses.map(({ body }) => body.data.session.id)).size, 1);
    assert.equal(await ClassSession.countDocuments({ classroom: classroom._id }), 1);

    const again = await startNow(token, classroom, { durationMinutes: 30 });
    assert.equal(again.status, 200);
    assert.equal(again.body.data.created, false);
    assert.equal(await ClassSession.countDocuments({ classroom: classroom._id }), 1);
    const stored = await Classroom.findById(classroom._id).select('+sessionStartLockedAt').lean();
    assert.equal(stored.sessionStartLockedAt, undefined);
  });

  it('accepts a length but never a date, and rejects people who do not teach the class', async () => {
    const { teacher, otherTeacher, student, classroom } = await setupClass();
    const admin = await createUser({ role: 'admin' });

    assert.equal((await startNow(await login(student), classroom)).status, 403);
    assert.equal((await startNow(await login(otherTeacher), classroom)).status, 403);
    assert.equal((await request(app).post('/api/sessions/start').send({ classroomId: classroom.id })).status, 401);
    const teacherToken = await login(teacher);
    assert.equal((await startNow(teacherToken, classroom, { startsAt: new Date().toISOString() })).status, 400);
    assert.equal((await startNow(teacherToken, classroom, { durationMinutes: 5 })).status, 400);
    assert.equal(await ClassSession.countDocuments(), 0);

    const byAdmin = await startNow(await login(admin), classroom, { durationMinutes: 30, title: 'Catch-up' });
    assert.equal(byAdmin.status, 201);
    assert.equal(byAdmin.body.data.session.title, 'Catch-up');
    assert.equal(new Date(byAdmin.body.data.session.endsAt) - new Date(byAdmin.body.data.session.startsAt), 30 * 60_000);

    classroom.status = 'archived';
    await classroom.save();
    assert.equal((await startNow(teacherToken, classroom)).status, 400);
  });

  it('leaves later scheduled sessions alone and starts one that is about to begin early', async () => {
    const { teacher, student, classroom } = await setupClass();
    const token = await login(teacher);
    const tomorrow = await schedule(classroom, 24 * 60 * 60_000);

    const first = await startNow(token, classroom);
    assert.equal(first.status, 201);
    assert.notEqual(first.body.data.session.id, tomorrow.id);
    assert.equal((await ClassSession.findById(tomorrow._id)).startsAt.getTime(), tomorrow.startsAt.getTime());
    await ClassSession.deleteOne({ _id: first.body.data.session.id });

    // A student is already waiting in the room of a session that starts in ten minutes.
    const soon = await schedule(classroom, 10 * 60_000);
    const studentSocket = await connect(await login(student));
    await emitAck(studentSocket, 'room:join', soon.id);
    assert.deepEqual(await attendanceOf(soon._id, student), []);

    const early = await startNow(token, classroom);
    assert.equal(early.status, 200);
    assert.equal(early.body.data.session.id, soon.id);
    assert.ok(new Date(early.body.data.session.startsAt).getTime() <= Date.now());
    assert.equal(await ClassSession.countDocuments({ classroom: classroom._id }), 2);

    // Their attendance starts when the class does, not when they came in.
    await sleep(300);
    const [entry] = await attendanceOf(soon._id, student);
    assert.equal(entry.status, 'present');
    assert.ok(entry.checkInAt >= new Date(early.body.data.session.startsAt));
    assert.ok(entry.activeSince);
  });

  it('keeps the scheduled workflow working and tells the class about it', async () => {
    const { teacher, student, classroom } = await setupClass();
    const token = await login(teacher);
    const feed = await watch(await login(student));
    const changed = waitForEvent(feed.socket, 'session:schedule-changed');
    const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60_000);
    const created = await request(app).post('/api/sessions').set(auth(token)).send({
      classroomId: classroom.id,
      title: 'Planned lesson',
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await changed, { classroomId: classroom.id });

    const cancelled = waitForEvent(feed.socket, 'session:schedule-changed');
    const cancel = await request(app)
      .post(`/api/sessions/${created.body.data.items[0].id}/cancel`)
      .set(auth(token))
      .send({ scope: 'occurrence' });
    assert.equal(cancel.status, 200);
    await cancelled;
  });
});

describe('who is in the room, seen from other pages', () => {
  it('updates teachers and students as people enter and leave, with names for teachers only', async () => {
    const { teacher, students, classroom, outsider } = await setupClass({ students: 2 });
    const teacherToken = await login(teacher);
    const [first, second] = students;
    const { session } = (await startNow(teacherToken, classroom)).body.data;

    const teacherFeed = await watch(teacherToken);
    const studentFeed = await watch(await login(second));
    const outsiderFeed = await watch(await login(outsider));
    const leaked = collect(outsiderFeed.socket, 'session:presence', 800);

    // A student enters: the teacher sees who, the classmate only sees the count.
    const firstSocket = await connect(await login(first));
    let forTeacher = waitForEvent(teacherFeed.socket, 'session:presence');
    let forStudent = waitForEvent(studentFeed.socket, 'session:presence');
    await emitAck(firstSocket, 'room:join', session.id);
    const seenByTeacher = await forTeacher;
    assert.equal(seenByTeacher.count, 1);
    assert.deepEqual(seenByTeacher.participants, [{ userId: first.id, name: first.fullName, role: 'student' }]);
    assert.deepEqual(seenByTeacher.change, { type: 'joined', role: 'student', name: first.fullName, userId: first.id });
    const seenByStudent = await forStudent;
    assert.deepEqual(seenByStudent, {
      sessionId: session.id,
      classroomId: classroom.id,
      count: 1,
      teachers: [],
      change: { type: 'joined', role: 'student' },
    });

    // The teacher enters: students are told the teacher is there.
    const teacherSocket = await connect(teacherToken);
    forStudent = waitForEvent(studentFeed.socket, 'session:presence');
    await emitAck(teacherSocket, 'room:join', session.id);
    const withTeacher = await forStudent;
    assert.equal(withTeacher.count, 2);
    assert.deepEqual(withTeacher.teachers, [{ id: teacher.id, name: teacher.fullName }]);

    // Someone opening a page now gets the current state straight away.
    const late = await watch(await login(second));
    assert.equal(late.presence.length, 1);
    assert.equal(late.presence[0].count, 2);
    assert.equal(late.presence[0].participants, undefined);
    assert.equal((await watch(teacherToken)).presence[0].participants.length, 2);

    // A second tab of the same person does not count twice, and closing one tab is not leaving.
    const secondTab = await connect(await login(first));
    await emitAck(secondTab, 'room:join', session.id);
    assert.equal((await watch(teacherToken)).presence[0].count, 2);
    const noChange = collect(teacherFeed.socket, 'session:presence', 300);
    secondTab.disconnect();
    assert.deepEqual(await noChange, []);

    // Leaving for real updates everyone.
    forTeacher = waitForEvent(teacherFeed.socket, 'session:presence');
    await emitAck(firstSocket, 'room:leave');
    const afterLeave = await forTeacher;
    assert.equal(afterLeave.count, 1);
    assert.equal(afterLeave.change.type, 'left');
    assert.equal(afterLeave.change.name, first.fullName);

    assert.deepEqual(await leaked, []);
    assert.deepEqual(outsiderFeed.presence, []);
  });

  it('stops and starts following a classroom when an administrator changes who is in it', async () => {
    const { teacher, student, outsider, classroom } = await setupClass();
    const admin = await createUser({ role: 'admin' });
    const adminToken = await login(admin);
    const studentFeed = await watch(await login(student));
    const outsiderFeed = await watch(await login(outsider));
    const adminFeed = await watch(adminToken);

    const update = await request(app).patch(`/api/classrooms/${classroom.id}`).set(auth(adminToken))
      .send({ studentIds: [outsider.id] });
    assert.equal(update.status, 200);

    const forNewStudent = waitForEvent(outsiderFeed.socket, 'session:started');
    const forAdmin = waitForEvent(adminFeed.socket, 'session:started');
    const forRemoved = collect(studentFeed.socket, 'session:started');
    assert.equal((await startNow(await login(teacher), classroom)).status, 201);
    await forNewStudent;
    await forAdmin;
    assert.deepEqual(await forRemoved, []);
  });
});

describe('attendance from time in the room', () => {
  it('adds up each stay when someone leaves and comes back', async () => {
    const { teacher, student, classroom } = await setupClass();
    const { session } = (await startNow(await login(teacher), classroom)).body.data;
    const socket = await connect(await login(student));
    const began = Date.now();

    await emitAck(socket, 'room:join', session.id);
    await sleep(250);
    await emitAck(socket, 'room:leave');
    const [afterFirst] = await attendanceOf(session.id, student);
    assert.equal(afterFirst.activeSince, undefined);
    assert.ok(afterFirst.leftAt);
    assert.ok(afterFirst.durationMs >= 240, `first stay was ${afterFirst.durationMs} ms`);

    await sleep(400);
    await emitAck(socket, 'room:join', session.id);
    await sleep(250);
    await emitAck(socket, 'room:leave');
    const elapsed = Date.now() - began;

    const entries = await attendanceOf(session.id, student);
    assert.equal(entries.length, 1);
    const [entry] = entries;
    assert.equal(entry.status, 'present');
    assert.equal(entry.checkInAt.getTime(), afterFirst.checkInAt.getTime());
    // Both stays count; the 400 ms away does not.
    assert.ok(entry.durationMs >= 480, `attended ${entry.durationMs} ms`);
    assert.ok(entry.durationMs <= elapsed - 390, `attended ${entry.durationMs} ms of ${elapsed} ms`);

    const report = await request(app).get(`/api/sessions/${session.id}/attendance`).set(auth(await login(teacher)));
    const row = report.body.data.items.find(({ participant }) => participant.id === student.id);
    assert.equal(row.durationMs, entry.durationMs);
  });

  it('counts a refresh, a dropped connection and a second tab once', async () => {
    const { teacher, student, classroom } = await setupClass();
    const { session } = (await startNow(await login(teacher), classroom)).body.data;
    const token = await login(student);

    // Two tabs open the room at the same moment, and one asks twice.
    const [tabOne, tabTwo] = await Promise.all([connect(token), connect(token)]);
    await Promise.all([
      emitAck(tabOne, 'room:join', session.id),
      emitAck(tabTwo, 'room:join', session.id),
      emitAck(tabOne, 'room:join', session.id),
    ]);
    await sleep(200);
    let entries = await attendanceOf(session.id, student);
    assert.equal(entries.length, 1);
    const openedAt = entries[0].activeSince.getTime();

    // One tab closing leaves the stay open; time is not counted twice for the two tabs.
    tabTwo.disconnect();
    await sleep(150);
    entries = await attendanceOf(session.id, student);
    assert.equal(entries[0].activeSince.getTime(), openedAt);
    assert.equal(entries[0].durationMs, 0);

    // The connection drops (a refresh, or the network): the stay closes, and reopens on return.
    tabOne.disconnect();
    await sleep(200);
    entries = await attendanceOf(session.id, student);
    assert.equal(entries[0].activeSince, undefined);
    const beforeReturn = entries[0].durationMs;
    assert.ok(beforeReturn >= 300 && beforeReturn < 1_500, `attended ${beforeReturn} ms`);

    const back = await connect(token);
    await emitAck(back, 'room:join', session.id);
    entries = await attendanceOf(session.id, student);
    assert.equal(entries.length, 1);
    assert.ok(entries[0].activeSince.getTime() > openedAt);
    assert.equal(entries[0].durationMs, beforeReturn);
    assert.equal(entries[0].leftAt, undefined);
  });

  it('is safe to repeat and safe when a whole class arrives together', async () => {
    const { teacher, students, classroom } = await setupClass({ students: 6 });
    const { session } = (await startNow(await login(teacher), classroom)).body.data;

    await Promise.all(students.flatMap((student) => [
      recordRoomJoin(session.id, student),
      recordRoomJoin(session.id, student),
      recordRoomJoin(session.id, student),
    ]));
    let stored = await ClassSession.findById(session.id).lean();
    assert.equal(stored.attendance.length, 6);
    assert.equal(new Set(stored.attendance.map((entry) => String(entry.participant))).size, 6);

    await sleep(120);
    await Promise.all(students.flatMap((student) => [
      recordRoomLeave(session.id, student),
      recordRoomLeave(session.id, student),
    ]));
    stored = await ClassSession.findById(session.id).lean();
    for (const entry of stored.attendance) {
      assert.equal(entry.activeSince, undefined);
      // Leaving twice counts the stay once.
      assert.ok(entry.durationMs >= 100 && entry.durationMs < 1_000, `attended ${entry.durationMs} ms`);
    }

    // The same through the room, each student on their own connection.
    const tokens = await Promise.all(students.map(login));
    const connections = await Promise.all(tokens.map(connect));
    const replies = await Promise.all(connections.map((socket) => emitAck(socket, 'room:join', session.id)));
    assert.deepEqual(replies.filter((reply) => reply.error), []);
    stored = await ClassSession.findById(session.id).lean();
    assert.equal(stored.attendance.length, 6);
    assert.ok(stored.attendance.every((entry) => entry.activeSince));
  });

  it('does not count time in the room before the class starts', async () => {
    const { student, classroom } = await setupClass();
    const session = await schedule(classroom, 500);
    const socket = await connect(await login(student));

    await emitAck(socket, 'room:join', session.id);
    assert.deepEqual(await attendanceOf(session._id, student), []);

    // Still in the room when it starts: attendance begins then, on time.
    await sleep(900);
    const [entry] = await attendanceOf(session._id, student);
    assert.equal(entry.status, 'present');
    assert.ok(entry.checkInAt >= session.startsAt, 'attendance began before the class did');
    assert.ok(entry.checkInAt - session.startsAt < 400);

    // Someone who comes early and leaves before the start did not attend.
    const other = await schedule(classroom, 60_000);
    await emitAck(socket, 'room:join', other.id);
    await emitAck(socket, 'room:leave');
    assert.deepEqual(await attendanceOf(other._id, student), []);
  });

  it('never counts time after the session ends, and closes stays cut off by a restart', async () => {
    const { teacher, student, classroom } = await setupClass();
    const activeSince = new Date(Date.now() - 20 * 60_000);
    const endsAt = new Date(Date.now() - 5 * 60_000);
    const finished = await ClassSession.create({
      classroom: classroom._id,
      title: 'Finished',
      startsAt: new Date(Date.now() - 65 * 60_000),
      endsAt,
      attendance: [{ participant: student._id, role: 'student', status: 'present', checkInAt: activeSince, activeSince, durationMs: 1_000 }],
    });
    const running = await ClassSession.create({
      classroom: classroom._id,
      title: 'Running',
      startsAt: new Date(Date.now() - 30 * 60_000),
      endsAt: new Date(Date.now() + 30 * 60_000),
      attendance: [
        { participant: student._id, role: 'student', status: 'late', checkInAt: activeSince, activeSince, durationMs: 0 },
        { participant: teacher._id, role: 'teacher', status: 'present', checkInAt: activeSince, leftAt: activeSince, durationMs: 5 },
      ],
    });

    const restartedAt = new Date(Date.now() - 60_000);
    assert.equal(await closeInterruptedAttendance(restartedAt), 2);

    const [past] = await attendanceOf(finished._id, student);
    assert.equal(past.activeSince, undefined);
    assert.equal(past.durationMs, 1_000 + (endsAt - activeSince));
    assert.equal(past.leftAt.getTime(), endsAt.getTime());
    const [current] = await attendanceOf(running._id, student);
    assert.equal(current.durationMs, restartedAt - activeSince);
    assert.equal(current.status, 'late');
    assert.equal((await attendanceOf(running._id, teacher))[0].durationMs, 5);
    assert.equal(await closeInterruptedAttendance(), 0);
  });
});

describe('ending a class', () => {
  it('tells everyone, closes attendance and keeps students out', async () => {
    const { teacher, student, outsider, classroom } = await setupClass();
    const teacherToken = await login(teacher);
    const studentToken = await login(student);
    const { session } = (await startNow(teacherToken, classroom)).body.data;
    const studentFeed = await watch(studentToken);
    const teacherSocket = await connect(teacherToken);
    const studentSocket = await connect(studentToken);
    await emitAck(teacherSocket, 'room:join', session.id);
    await emitAck(studentSocket, 'room:join', session.id);
    await sleep(150);

    // Students cannot end the class, change attendance, or act on a class that is not theirs.
    assert.equal((await emitAck(studentSocket, 'room:end')).error, 'Only the class teacher can do that');
    const correction = await request(app)
      .patch(`/api/sessions/${session.id}/attendance/${student.id}`)
      .set(auth(studentToken))
      .send({ status: 'present' });
    assert.equal(correction.status, 403);
    const outsiderSocket = await connect(await login(outsider));
    assert.equal((await emitAck(outsiderSocket, 'room:join', session.id)).error, 'You are not assigned to this classroom');
    assert.equal((await emitAck(outsiderSocket, 'room:end')).error, 'Join the session before moderating it');
    assert.equal((await request(app).get(`/api/sessions/${session.id}/room`).set(auth(await login(outsider)))).status, 403);

    const ended = waitForEvent(studentFeed.socket, 'session:ended');
    const emptied = waitForEvent(studentFeed.socket, 'session:presence', (presence) => presence.count === 0);
    const kicked = waitForEvent(studentSocket, 'room:ended');
    assert.deepEqual(await emitAck(teacherSocket, 'room:end'), { success: true });
    const event = await ended;
    assert.equal(event.sessionId, session.id);
    assert.equal(event.classroomId, classroom.id);
    assert.ok(event.endedAt);
    assert.equal(event.by.id, teacher.id);
    await kicked;
    await emptied;

    // Nobody is left marked as in the room, and the time each spent there is kept.
    const stored = await ClassSession.findById(session.id).lean();
    assert.ok(stored.endedAt);
    assert.equal(stored.attendance.length, 2);
    for (const entry of stored.attendance) {
      assert.equal(entry.activeSince, undefined);
      assert.ok(entry.leftAt);
      assert.ok(entry.durationMs >= 140, `attended ${entry.durationMs} ms`);
    }
    assert.deepEqual((await watch(teacherToken)).presence, []);

    assert.equal((await emitAck(studentSocket, 'room:join', session.id)).error, 'The teacher has ended this class.');
    const mine = await request(app).get('/api/sessions').query({ view: 'mine' }).set(auth(studentToken));
    assert.ok(mine.body.data.items.find((item) => item.id === session.id).endedAt);

    // Starting again makes a new class; the ended one stays ended.
    const next = await startNow(teacherToken, classroom);
    assert.equal(next.status, 201);
    assert.notEqual(next.body.data.session.id, session.id);
  });
});
