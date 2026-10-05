import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import request from 'supertest';
import { io as createClient } from 'socket.io-client';
import { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';
import { attachSessionSocket } from '../src/realtime/sessionSocket.js';

const app = createApp();
const server = createServer(app);
const ioServer = attachSessionSocket(server);
let serverUrl;
let sockets = [];

const login = async (user) => {
  const response = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  return response.body.data.token;
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** A signed-in page's connection, with every `data:changed` it is sent. */
async function connect(token) {
  const socket = createClient(serverUrl, { auth: { token }, reconnection: false });
  sockets.push(socket);
  const changes = [];
  socket.on('data:changed', ({ resource }) => changes.push(resource));
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return changes;
}

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
afterEach(() => {
  for (const socket of sockets) socket.disconnect();
  sockets = [];
});

describe('telling pages that a list changed', () => {
  it('tells everyone about a new classroom, and only administrators about accounts', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const adminToken = await login(admin);
    const adminChanges = await connect(adminToken);
    const teacherChanges = await connect(await login(teacher));

    await request(app).post('/api/classrooms').set(auth(adminToken)).send({ name: 'Room 1', teacherId: teacher.id });
    await request(app).patch(`/api/users/${teacher.id}`).set(auth(adminToken)).send({ firstName: 'Renamed' });
    // A request that fails changes nothing, so nothing is said.
    await request(app).post('/api/classrooms').set(auth(adminToken)).send({ name: '' });
    await sleep(200);

    assert.deepEqual(teacherChanges, ['classrooms', 'announcements', 'classrooms']);
    assert.deepEqual(adminChanges, ['classrooms', 'announcements', 'users', 'classrooms']);
  });

  it('tells administrators about a new application, and the student about the decision', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const other = await createUser({ role: 'student' });
    const adminToken = await login(admin);
    const studentToken = await login(student);
    const classroom = await request(app).post('/api/classrooms').set(auth(adminToken)).send({ name: 'Room 1', teacherId: teacher.id });

    const adminChanges = await connect(adminToken);
    const studentChanges = await connect(studentToken);
    const otherChanges = await connect(await login(other));

    const asked = await request(app)
      .post('/api/enrollment/requests')
      .set(auth(studentToken))
      .send({ classroomIds: [classroom.body.data.classroom.id] });
    await sleep(200);
    assert.deepEqual(adminChanges, ['enrollment']);
    assert.deepEqual(studentChanges, ['enrollment']);
    assert.deepEqual(otherChanges, []);

    const { id, requests } = asked.body.data.application;
    await request(app)
      .patch(`/api/enrollment/applications/${id}/requests/${requests[0].id}`)
      .set(auth(adminToken))
      .send({ status: 'approved' });
    await sleep(200);
    // The student is told about their request and, like everyone, that a class roster changed.
    assert.deepEqual(studentChanges.sort(), ['classrooms', 'enrollment', 'enrollment']);
    assert.deepEqual(otherChanges, ['classrooms']);
  });
});
