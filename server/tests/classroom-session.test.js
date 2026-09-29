import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createUser, clearDatabase, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';
import { Classroom } from '../src/models/Classroom.js';
import { ClassSession } from '../src/models/ClassSession.js';
import { attendanceStatusForCheckIn, ATTENDANCE_GRACE_PERIOD_MS } from '../src/utils/attendancePolicy.js';
import { recordRoomJoin } from '../src/services/session.service.js';

const app = createApp();
const login = async (user) => {
  const response = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(response.status, 200);
  return response.body.data.token;
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });

before(startDatabase);
after(stopDatabase);
beforeEach(clearDatabase);

describe('attendance timing policy', () => {
  it('counts arrivals through five minutes as present and later arrivals as late', () => {
    const startsAt = new Date('2026-09-29T10:00:00.000Z');

    assert.equal(
      attendanceStatusForCheckIn(startsAt, new Date(startsAt.getTime() + ATTENDANCE_GRACE_PERIOD_MS)),
      'present',
    );
    assert.equal(
      attendanceStatusForCheckIn(startsAt, new Date(startsAt.getTime() + ATTENDANCE_GRACE_PERIOD_MS + 1)),
      'late',
    );
  });
});

describe('classroom administration', () => {
  it('restricts classroom management to admins and validates active assignments', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const adminToken = await login(admin);
    const teacherToken = await login(teacher);

    const forbidden = await request(app).get('/api/classrooms').set(auth(teacherToken));
    assert.equal(forbidden.status, 200);
    assert.deepEqual(forbidden.body.data.items, []);

    const created = await request(app)
      .post('/api/classrooms')
      .set(auth(adminToken))
      .send({ name: 'Room 1', teacherId: teacher.id, studentIds: [student.id] });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.classroom.name, 'Room 1');
    assert.equal(created.body.data.classroom.students.length, 1);
    const teacherClassrooms = await request(app).get('/api/classrooms').set(auth(teacherToken));
    assert.equal(teacherClassrooms.body.data.items.length, 1);
    assert.equal(teacherClassrooms.body.data.items[0].teacher.id, teacher.id);
    assert.equal(teacherClassrooms.body.data.items[0].name, 'Room 1');
    const teacherCreate = await request(app)
      .post('/api/classrooms')
      .set(auth(teacherToken))
      .send({ name: 'Not allowed', teacherId: teacher.id, studentIds: [] });
    assert.equal(teacherCreate.status, 403);

    const updated = await request(app)
      .patch(`/api/classrooms/${created.body.data.classroom.id}`)
      .set(auth(adminToken))
      .send({ name: 'Renamed room' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.classroom.name, 'Renamed room');
    assert.equal(updated.body.data.classroom.archived, false);

    const inactive = await createUser({ role: 'teacher', status: 'inactive' });
    const invalid = await request(app)
      .post('/api/classrooms')
      .set(auth(adminToken))
      .send({ name: 'Bad room', teacherId: inactive.id, studentIds: [] });
    assert.equal(invalid.status, 400);
  });

  it('assigns multiple active teachers and lets each manage classroom sessions', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const coTeacher = await createUser({ role: 'teacher' });
    const adminToken = await login(admin);
    const teacherToken = await login(teacher);
    const coTeacherToken = await login(coTeacher);

    const created = await request(app)
      .post('/api/classrooms')
      .set(auth(adminToken))
      .send({ name: 'Co-taught room', teacherIds: [teacher.id, coTeacher.id] });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.data.classroom.teachers.map(({ id }) => id), [teacher.id, coTeacher.id]);
    assert.equal(created.body.data.classroom.teacher.id, teacher.id);

    for (const token of [teacherToken, coTeacherToken]) {
      const classrooms = await request(app).get('/api/classrooms').set(auth(token));
      assert.equal(classrooms.body.data.items.length, 1);
      assert.equal(classrooms.body.data.items[0].teachers.length, 2);
    }

    const startsAt = new Date(Date.now() + 60_000);
    const endsAt = new Date(Date.now() + 3_600_000);
    const scheduled = await request(app)
      .post('/api/sessions')
      .set(auth(coTeacherToken))
      .send({
        classroomId: created.body.data.classroom.id,
        title: 'Co-taught lesson',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    assert.equal(scheduled.status, 201);
    const attendance = await request(app)
      .get(`/api/sessions/${scheduled.body.data.items[0].id}/attendance`)
      .set(auth(coTeacherToken));
    assert.equal(attendance.status, 200);

    const updated = await request(app)
      .patch(`/api/classrooms/${created.body.data.classroom.id}`)
      .set(auth(adminToken))
      .send({ teacherIds: [coTeacher.id] });
    assert.deepEqual(updated.body.data.classroom.teachers.map(({ id }) => id), [coTeacher.id]);
    const removedTeacherClassrooms = await request(app).get('/api/classrooms').set(auth(teacherToken));
    assert.deepEqual(removedTeacherClassrooms.body.data.items, []);
  });

  it('archives without removing class or session history', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const adminToken = await login(admin);
    const teacherToken = await login(teacher);
    const studentToken = await login(student);
    const classroom = await Classroom.create({ name: 'History', teacher: teacher._id, students: [student._id] });
    const session = await ClassSession.create({
      classroom: classroom._id,
      title: 'History lesson',
      startsAt: new Date(Date.now() - 3_600_000),
      endsAt: new Date(Date.now() - 1_800_000),
    });

    const response = await request(app)
      .post(`/api/classrooms/${classroom.id}/archive`)
      .set(auth(adminToken));
    assert.equal(response.status, 200);
    assert.equal(response.body.data.classroom.status, 'archived');
    assert.equal(response.body.data.classroom.archived, true);
    assert.ok(await ClassSession.findById(session._id));

    const teacherSessions = await request(app).get('/api/sessions').set(auth(teacherToken));
    assert.equal(teacherSessions.status, 200);
    assert.equal(teacherSessions.body.data.items[0].id, session.id);
    const studentSessions = await request(app)
      .get('/api/sessions?view=mine')
      .set(auth(studentToken));
    assert.equal(studentSessions.status, 200);
    assert.equal(studentSessions.body.data.items[0].id, session.id);
    const attendanceHistory = await request(app)
      .get(`/api/sessions/${session.id}/attendance`)
      .set(auth(teacherToken));
    assert.equal(attendanceHistory.status, 200);
    assert.equal(attendanceHistory.body.data.items[0].status, 'absent');

    const defaults = await request(app).get('/api/classrooms').set(auth(adminToken));
    assert.equal(defaults.body.data.items.length, 0);
    const includingArchived = await request(app)
      .get('/api/classrooms?includeArchived=true')
      .set(auth(adminToken));
    assert.equal(includingArchived.status, 200);
    assert.equal(includingArchived.body.data.items[0].archived, true);
    const invalid = await request(app)
      .get('/api/classrooms?includeArchived=yes')
      .set(auth(adminToken));
    assert.equal(invalid.status, 400);
  });
});

describe('class sessions and attendance', () => {
  async function setupClass() {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const unrelatedStudent = await createUser({ role: 'student' });
    const classroom = await Classroom.create({
      name: 'Math',
      teacher: teacher._id,
      students: [student._id],
    });
    return {
      teacher,
      student,
      unrelatedStudent,
      classroom,
      teacherToken: await login(teacher),
      studentToken: await login(student),
      unrelatedToken: await login(unrelatedStudent),
    };
  }

  it('creates one-time and recurring sessions only for the assigned teacher', async () => {
    const { teacher, teacherToken, classroom } = await setupClass();
    const otherTeacher = await createUser({ role: 'teacher' });
    const otherToken = await login(otherTeacher);
    const startsAt = new Date(Date.now() + 60_000);
    const endsAt = new Date(Date.now() + 3_600_000);

    const denied = await request(app)
      .post('/api/sessions')
      .set(auth(otherToken))
      .send({ classroomId: classroom.id, title: 'No', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    assert.equal(denied.status, 403);

    const once = await request(app)
      .post('/api/sessions')
      .set(auth(teacherToken))
      .send({ classroomId: classroom.id, title: 'One-off', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    assert.equal(once.status, 201);
    assert.equal(once.body.data.items[0].classroom.name, 'Math');
    assert.deepEqual(once.body.data.items[0].attendance, { status: null, checkInAt: null });
    assert.ok(once.body.data.items[0].id);
    assert.ok(once.body.data.items[0].startsAt);

    const recurring = await request(app)
      .post('/api/sessions')
      .set(auth(teacherToken))
      .send({
        classroomId: classroom.id,
        title: 'Weekly',
        startDate: '2026-10-05',
        endDate: '2026-10-19',
        startTime: '09:00',
        endTime: '10:00',
        weekdays: [1],
        timezone: 'UTC',
      });
    assert.equal(recurring.status, 201);
    assert.equal(recurring.body.data.items.length, 3);
    assert.ok(recurring.body.data.items.every((item) => item.seriesId));
    assert.equal((await request(app).get('/api/sessions').set(auth(teacherToken))).body.data.items.length, 4);
    const occurrences = recurring.body.data.items;
    const edited = await request(app)
      .patch(`/api/sessions/${occurrences[0].id}`)
      .set(auth(teacherToken))
      .send({
        scope: 'occurrence',
        title: 'Changed occurrence',
        startsAt: new Date(new Date(occurrences[0].startsAt).getTime() + 24.5 * 60 * 60_000).toISOString(),
        endsAt: new Date(new Date(occurrences[0].endsAt).getTime() + 24.5 * 60 * 60_000).toISOString(),
      });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.items.find((item) => item.id === occurrences[0].id).title, 'Changed occurrence');
    assert.equal(
      new Date(edited.body.data.items.find((item) => item.id === occurrences[0].id).startsAt).getTime(),
      new Date(occurrences[0].startsAt).getTime() + 24.5 * 60 * 60_000,
    );
    const afterOccurrenceEdit = await request(app).get('/api/sessions').set(auth(teacherToken));
    assert.equal(afterOccurrenceEdit.body.data.items.filter((item) => item.title === 'Weekly').length, 2);
    const beforeSeriesEdit = await request(app).get('/api/sessions').set(auth(teacherToken));
    const datesBeforeSeriesEdit = new Map(beforeSeriesEdit.body.data.items
      .filter((item) => item.seriesId === occurrences[0].seriesId)
      .map((item) => [item.id, new Date(item.startsAt).toISOString().slice(0, 10)]));
    const selectedDate = new Date(edited.body.data.items.find((item) => item.id === occurrences[0].id).startsAt)
      .toISOString().slice(0, 10);
    const seriesEdit = await request(app)
      .patch(`/api/sessions/${occurrences[0].id}`)
      .set(auth(teacherToken))
      .send({
        scope: 'series',
        title: 'Changed series',
        startsAt: `${selectedDate}T11:30:00.000Z`,
        endsAt: `${selectedDate}T12:30:00.000Z`,
      });
    assert.equal(seriesEdit.status, 200);
    assert.equal(seriesEdit.body.data.items.filter((item) => item.title === 'Changed series').length, 3);
    for (const item of seriesEdit.body.data.items) {
      assert.equal(new Date(item.startsAt).toISOString().slice(0, 10), datesBeforeSeriesEdit.get(item.id));
      assert.equal(new Date(item.startsAt).toISOString().slice(11, 16), '11:30');
      assert.equal(new Date(item.endsAt).toISOString().slice(11, 16), '12:30');
    }
    const cancelled = await request(app)
      .post(`/api/sessions/${occurrences[0].id}/cancel`)
      .set(auth(teacherToken))
      .send({ scope: 'occurrence' });
    assert.equal(cancelled.body.data.items[0].status, 'cancelled');
    const cancelledSeries = await request(app)
      .post(`/api/sessions/${occurrences[1].id}/cancel`)
      .set(auth(teacherToken))
      .send({ scope: 'series' });
    assert.equal(cancelledSeries.status, 200);
    assert.equal(cancelledSeries.body.data.items.length, 3);
    assert.equal((await ClassSession.countDocuments({ seriesId: occurrences[0].seriesId, status: 'cancelled' })), 3);
    assert.equal(String(teacher._id), String(classroom.teacher));
  });

  it('lets teachers and admins update classroom assignments while preserving session rosters', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const coTeacher = await createUser({ role: 'teacher' });
    const inactiveTeacher = await createUser({ role: 'teacher', status: 'inactive' });
    const student = await createUser({ role: 'student' });
    const addedStudent = await createUser({ role: 'student' });
    const inactiveStudent = await createUser({ role: 'student', status: 'inactive' });
    const admin = await createUser({ role: 'admin' });
    const classroom = await Classroom.create({
      name: 'Assigned room',
      teacher: teacher._id,
      teachers: [teacher._id],
      students: [student._id],
    });
    const teacherToken = await login(teacher);
    const coTeacherToken = await login(coTeacher);
    const adminToken = await login(admin);

    const options = await request(app)
      .get(`/api/sessions/assignment-options?classroomId=${classroom.id}`)
      .set(auth(teacherToken));
    assert.equal(options.status, 200);
    assert.ok(options.body.data.teachers.some(({ id }) => id === teacher.id));
    assert.ok(options.body.data.teachers.some(({ id }) => id === coTeacher.id));
    assert.ok(!options.body.data.teachers.some(({ id }) => id === inactiveTeacher.id));
    assert.ok(options.body.data.students.some(({ id }) => id === student.id));
    assert.ok(options.body.data.students.some(({ id }) => id === addedStudent.id));
    assert.ok(!options.body.data.students.some(({ id }) => id === inactiveStudent.id));

    const startsAt = new Date(Date.now() + 60 * 60_000);
    const endsAt = new Date(Date.now() + 2 * 60 * 60_000);
    const first = await request(app)
      .post('/api/sessions')
      .set(auth(teacherToken))
      .send({
        classroomId: classroom.id,
        teacherIds: [teacher.id, coTeacher.id],
        studentIds: [student.id, addedStudent.id],
        title: 'Shared roster',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    assert.equal(first.status, 201);
    const firstSession = first.body.data.items[0];
    assert.equal(firstSession.assignments.teachers.length, 2);
    assert.equal(firstSession.assignments.students.length, 2);

    const next = await request(app)
      .post('/api/sessions')
      .set(auth(adminToken))
      .send({
        classroomId: classroom.id,
        teacherIds: [coTeacher.id],
        studentIds: [addedStudent.id],
        title: 'Updated roster',
        startsAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
        endsAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
      });
    assert.equal(next.status, 201);
    assert.equal(next.body.data.items[0].assignments.teachers.length, 1);
    assert.equal(next.body.data.items[0].assignments.students.length, 1);

    const savedClassroom = await Classroom.findById(classroom.id);
    assert.deepEqual(savedClassroom.teachers.map(String), [String(coTeacher._id)]);
    assert.deepEqual(savedClassroom.students.map(String), [String(addedStudent._id)]);

    const teacherSessions = await request(app).get('/api/sessions').set(auth(teacherToken));
    assert.deepEqual(teacherSessions.body.data.items.map(({ id }) => id), [firstSession.id]);
    const coTeacherSessions = await request(app).get('/api/sessions').set(auth(coTeacherToken));
    assert.equal(coTeacherSessions.body.data.items.length, 2);
    const oldStudentSessions = await request(app)
      .get('/api/sessions?view=mine')
      .set(auth(await login(student)));
    assert.deepEqual(oldStudentSessions.body.data.items.map(({ id }) => id), [firstSession.id]);
    const adminSessions = await request(app).get('/api/sessions').set(auth(adminToken));
    assert.equal(adminSessions.body.data.items.length, 2);

    const oldRosterMessages = await request(app)
      .get(`/api/sessions/${firstSession.id}/messages`)
      .set(auth(await login(student)));
    assert.equal(oldRosterMessages.status, 200);
    const newRosterDenied = await request(app)
      .get(`/api/sessions/${next.body.data.items[0].id}/messages`)
      .set(auth(await login(student)));
    assert.equal(newRosterDenied.status, 403);
  });

  it('filters student sessions and records attendance from joining during the class', async () => {
    const { student, teacherToken, studentToken, unrelatedToken, classroom } = await setupClass();
    const startsAt = new Date(Date.now() - 6 * 60_000);
    const endsAt = new Date(Date.now() + 20 * 60_000);
    const created = await request(app)
      .post('/api/sessions')
      .set(auth(teacherToken))
      .send({ classroomId: classroom.id, title: 'Today', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    const sessionId = created.body.data.items[0].id;

    const mine = await request(app).get('/api/sessions?view=mine').set(auth(studentToken));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.items.length, 1);
    assert.equal((await request(app).get('/api/sessions?view=mine').set(auth(unrelatedToken))).body.data.items.length, 0);

    await recordRoomJoin(sessionId, student);
    const refreshed = await request(app).get('/api/sessions?view=mine').set(auth(studentToken));
    assert.equal(refreshed.body.data.items[0].attendance.status, 'late');
    assert.ok(refreshed.body.data.items[0].attendance.checkInAt);
    assert.equal(
      (await ClassSession.findById(sessionId)).attendance.filter((entry) => String(entry.participant) === student.id).length,
      1,
    );
    const unassignedJoin = recordRoomJoin(sessionId, await createUser({ role: 'student' }));
    await assert.rejects(unassignedJoin, { statusCode: 403 });

    const future = await request(app)
      .post('/api/sessions')
      .set(auth(teacherToken))
      .send({
        classroomId: classroom.id,
        title: 'Not started',
        startsAt: new Date(Date.now() + 60_000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
    await recordRoomJoin(future.body.data.items[0].id, student);
    const beforeStart = await ClassSession.findById(future.body.data.items[0].id);
    assert.equal(beforeStart.attendance.length, 0);

    const withinGracePeriod = await request(app)
      .post('/api/sessions')
      .set(auth(teacherToken))
      .send({
        classroomId: classroom.id,
        title: 'On time',
        startsAt: new Date(Date.now() - 4 * 60_000).toISOString(),
        endsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      });
    await recordRoomJoin(withinGracePeriod.body.data.items[0].id, student);
    const presentAttendance = await ClassSession.findById(withinGracePeriod.body.data.items[0].id);
    assert.equal(presentAttendance.attendance[0].status, 'present');
  });

  it('marks every in-session arrival present when attendance conditions are off', async () => {
    const { teacherToken, student, studentToken, classroom } = await setupClass();
    const created = await request(app)
      .post('/api/sessions')
      .set(auth(teacherToken))
      .send({
        classroomId: classroom.id,
        title: 'Unconditional attendance',
        startsAt: new Date(Date.now() - 6 * 60_000).toISOString(),
        endsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      });
    const sessionId = created.body.data.items[0].id;
    assert.equal(created.body.data.items[0].attendanceConditionEnabled, true);

    const disabled = await request(app)
      .patch(`/api/sessions/${sessionId}`)
      .set(auth(teacherToken))
      .send({ scope: 'occurrence', attendanceConditionEnabled: false });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.data.items[0].attendanceConditionEnabled, false);

    const studentSessions = await request(app).get('/api/sessions?view=mine').set(auth(studentToken));
    assert.equal(studentSessions.body.data.items[0].attendanceConditionEnabled, false);

    await recordRoomJoin(sessionId, student);
    const checkedIn = await ClassSession.findById(sessionId);
    assert.equal(checkedIn.attendance[0].status, 'present');

    const future = await request(app)
      .post('/api/sessions')
      .set(auth(teacherToken))
      .send({
        classroomId: classroom.id,
        title: 'Future session with conditions off',
        startsAt: new Date(Date.now() + 60_000).toISOString(),
        endsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      });
    const futureId = future.body.data.items[0].id;
    await request(app)
      .patch(`/api/sessions/${futureId}`)
      .set(auth(teacherToken))
      .send({ scope: 'occurrence', attendanceConditionEnabled: false });
    await recordRoomJoin(futureId, student);
    assert.equal((await ClassSession.findById(futureId)).attendance.length, 0);
  });

  it('records absences after session end and allows assigned teachers to correct them', async () => {
    const { teacherToken, student, classroom } = await setupClass();
    const session = await ClassSession.create({
      classroom: classroom._id,
      title: 'Finished',
      startsAt: new Date(Date.now() - 3_600_000),
      endsAt: new Date(Date.now() - 1_800_000),
      attendanceConditionEnabled: false,
    });
    const attendance = await request(app)
      .get(`/api/sessions/${session.id}/attendance`)
      .set(auth(teacherToken));
    assert.equal(attendance.status, 200);
    const studentAttendance = attendance.body.data.items.find(({ student: item }) => item.id === student.id);
    assert.equal(studentAttendance.status, 'absent');
    assert.equal(studentAttendance.student.name, `${student.firstName} ${student.lastName}`);
    assert.equal(studentAttendance.student.email, student.email);

    const corrected = await request(app)
      .patch(`/api/sessions/${session.id}/attendance/${student.id}`)
      .set(auth(teacherToken))
      .send({ status: 'present' });
    assert.equal(corrected.status, 200);
    assert.equal(
      corrected.body.data.attendance.find(({ participant }) => participant.id === student.id).status,
      'present',
    );
  });

  it('preserves past occurrence dates and attendance during series operations', async () => {
    const { teacherToken, student, classroom } = await setupClass();
    const seriesId = 'history-preservation-series';
    const now = Date.now();
    const pastStart = new Date(now - 48 * 60 * 60_000);
    const pastEnd = new Date(now - 47 * 60 * 60_000);
    const futureStart = new Date(Math.ceil((now + 24 * 60 * 60_000) / 60_000) * 60_000);
    const futureEnd = new Date(now + 25 * 60 * 60_000);
    const past = await ClassSession.create({
      classroom: classroom._id,
      title: 'Original series',
      startsAt: pastStart,
      endsAt: pastEnd,
      seriesId,
      attendance: [{ student: student._id, status: 'present', checkInAt: pastStart }],
    });
    const future = await ClassSession.create({
      classroom: classroom._id,
      title: 'Original series',
      startsAt: futureStart,
      endsAt: futureEnd,
      seriesId,
    });

    const startsAt = new Date(futureStart.getTime() + 30 * 60_000);
    const endsAt = new Date(futureEnd.getTime() + 30 * 60_000);
    const edited = await request(app)
      .patch(`/api/sessions/${future.id}`)
      .set(auth(teacherToken))
      .send({ scope: 'series', title: 'Updated future series', startsAt, endsAt });
    assert.equal(edited.status, 200);

    const pastAfterEdit = await ClassSession.findById(past._id);
    assert.equal(pastAfterEdit.title, 'Original series');
    assert.equal(pastAfterEdit.startsAt.getTime(), pastStart.getTime());
    assert.equal(pastAfterEdit.endsAt.getTime(), pastEnd.getTime());
    assert.equal(pastAfterEdit.attendance[0].status, 'present');
    assert.equal(pastAfterEdit.attendance[0].checkInAt.getTime(), pastStart.getTime());

    const editedFuture = await ClassSession.findById(future._id);
    assert.equal(editedFuture.title, 'Updated future series');
    assert.equal(editedFuture.startsAt.getTime(), startsAt.getTime());

    const cancelled = await request(app)
      .post(`/api/sessions/${future.id}/cancel`)
      .set(auth(teacherToken))
      .send({ scope: 'series' });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.items.length, 1);
    assert.equal((await ClassSession.findById(past._id)).status, 'scheduled');
    assert.equal((await ClassSession.findById(future._id)).status, 'cancelled');

    const pastEdit = await request(app)
      .patch(`/api/sessions/${past.id}`)
      .set(auth(teacherToken))
      .send({ scope: 'occurrence', title: 'Do not alter history' });
    assert.equal(pastEdit.status, 400);
    const pastCancel = await request(app)
      .post(`/api/sessions/${past.id}/cancel`)
      .set(auth(teacherToken))
      .send({ scope: 'occurrence' });
    assert.equal(pastCancel.status, 400);
  });
});
