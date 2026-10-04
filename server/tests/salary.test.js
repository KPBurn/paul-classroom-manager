import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createUser, clearDatabase, startDatabase, stopDatabase } from './helpers.js';
import { createApp } from '../src/app.js';
import { ClassSession } from '../src/models/ClassSession.js';
import { Classroom } from '../src/models/Classroom.js';
import { SalaryWithdrawal } from '../src/models/SalaryWithdrawal.js';
import { SystemSettings } from '../src/models/SystemSettings.js';
import {
  calendarTotals,
  earningsBuckets,
  earningsForSession,
  rateForClass,
  roundAmount,
  sessionRateFor,
} from '../src/utils/salary.js';
import { calendarKeys, localDateKey, localMonthKey, localWeekKey } from '../src/utils/timezone.js';

const app = createApp();
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

async function tokenFor(user) {
  const response = await request(app).post('/api/auth/login').send({
    email: user.email,
    password: 'Password123',
  });
  assert.equal(response.status, 200);
  return response.body.data.token;
}

const auth = async (user) => ({ Authorization: `Bearer ${await tokenFor(user)}` });

/** A classroom with its teacher (and optionally students). */
async function addClassroom({ teacher, students = [], name = 'Room A', sessionRate = null }) {
  return Classroom.create({
    name,
    teacher: teacher._id,
    teachers: [teacher._id],
    students: students.map(({ _id }) => _id),
    sessionRate,
  });
}

/** A finished class, with the teacher's attendance already recorded. */
async function addFinishedClass({
  classroom,
  teacher,
  daysAgo = 3,
  hours = 1,
  rate = 100,
  attendedMs = HOUR_MS,
  status = 'scheduled',
  students = [],
}) {
  const startsAt = new Date(Date.now() - daysAgo * DAY_MS);
  startsAt.setUTCHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + hours * HOUR_MS);
  return ClassSession.create({
    classroom: classroom._id,
    assignedTeachers: [teacher._id],
    assignedStudents: students.map(({ _id }) => _id),
    title: 'Math',
    rate,
    startsAt,
    endsAt,
    status,
    timezone: 'UTC',
    attendance: attendedMs === null ? [] : [{
      participant: teacher._id,
      role: 'teacher',
      status: 'present',
      checkInAt: startsAt,
      leftAt: new Date(startsAt.getTime() + attendedMs),
      durationMs: attendedMs,
    }],
  });
}

before(startDatabase);
after(stopDatabase);
beforeEach(clearDatabase);

describe('class earnings', () => {
  const session = {
    startsAt: new Date('2026-05-04T09:00:00Z'),
    endsAt: new Date('2026-05-04T10:00:00Z'),
    rate: 100,
  };
  const attendanceOf = (durationMs) => [{ participant: 'teacher-1', role: 'teacher', status: 'present', durationMs }];

  it('pays the full rate for being in the room for the whole class', () => {
    const earned = earningsForSession({ ...session, attendance: attendanceOf(HOUR_MS) }, 'teacher-1');
    assert.equal(earned.amount, 100);
    assert.equal(earned.share, 1);
  });

  it('pays the rate pro rata for part of the class', () => {
    const half = earningsForSession({ ...session, attendance: attendanceOf(HOUR_MS / 2) }, 'teacher-1');
    assert.equal(half.amount, 50);
    assert.equal(half.share, 0.5);
  });

  it('never pays more than the class rate', () => {
    const twice = earningsForSession({ ...session, attendance: attendanceOf(HOUR_MS * 2) }, 'teacher-1');
    assert.equal(twice.amount, 100);
  });

  it('counts a visit that is still going', () => {
    const inRoom = {
      ...session,
      attendance: [{
        participant: 'teacher-1',
        role: 'teacher',
        status: 'present',
        activeSince: session.startsAt,
        durationMs: 0,
      }],
    };
    const midway = earningsForSession(inRoom, 'teacher-1', { now: new Date('2026-05-04T09:30:00Z') });
    assert.equal(midway.amount, 50);
    // Once the class ends, the visit stops counting at the end of the session.
    const after = earningsForSession(inRoom, 'teacher-1', { now: new Date('2026-05-04T11:00:00Z') });
    assert.equal(after.amount, 100);
  });

  it('pays nothing for a class nobody joined', () => {
    const absent = earningsForSession({ ...session, attendance: [] }, 'teacher-1');
    assert.equal(absent.amount, 0);
    assert.equal(absent.rate, 100);
  });

  it('falls back to the school rate when the class has none of its own', () => {
    assert.equal(sessionRateFor({ rate: null }, 150), 150);
    assert.equal(sessionRateFor({ rate: 0 }, 150), 0);
    assert.equal(roundAmount(12.345), 12.35);
  });
});

describe('class and teacher rates', () => {
  it('takes the most specific rate: individual, then class, then school', () => {
    assert.equal(rateForClass({
      teacherRate: 150, sessionRate: 100, classroomRate: 120, defaultRate: 90,
    }), 150);
    assert.equal(rateForClass({ sessionRate: 100, classroomRate: 120, defaultRate: 90 }), 100);
    assert.equal(rateForClass({ classroomRate: 120, defaultRate: 90 }), 120);
    assert.equal(rateForClass({ defaultRate: 90 }), 90);
    // Zero is a real rate: it stops the search rather than falling through.
    assert.equal(rateForClass({ teacherRate: 0, sessionRate: 100 }), 0);
  });

  /** A class an hour long, attended in full, with the rates under test. */
  async function rateSetup({ teacherRate = null, classroomRate = null, rate = null } = {}) {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher', ...(teacherRate !== null && { sessionRate: teacherRate }) });
    const classroom = await addClassroom({
      teacher,
      ...(classroomRate !== null && { sessionRate: classroomRate }),
    });
    await addFinishedClass({ classroom, teacher, daysAgo: 2, hours: 1, rate, attendedMs: HOUR_MS });
    return { admin, teacher };
  }

  it('pays a teacher their individual rate for the class', async () => {
    const { teacher } = await rateSetup({ teacherRate: 150, classroomRate: 120, rate: 100 });

    const summary = await request(app).get('/api/salary/summary').set(await auth(teacher));

    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.classes[0].rate, 150);
    assert.equal(summary.body.data.totals.lifetime, 150);
    assert.equal(summary.body.data.teacher.sessionRate, 150);
  });

  it('pays the rate on the class when the teacher has no individual rate', async () => {
    const { teacher } = await rateSetup({ classroomRate: 120, rate: 100 });

    const summary = await request(app).get('/api/salary/summary').set(await auth(teacher));

    assert.equal(summary.body.data.classes[0].rate, 100);
    assert.equal(summary.body.data.totals.lifetime, 100);
    assert.equal(summary.body.data.teacher.sessionRate, null);
  });

  it('pays the classroom rate when the class has none of its own', async () => {
    const { teacher } = await rateSetup({ classroomRate: 120, rate: null });

    const summary = await request(app).get('/api/salary/summary').set(await auth(teacher));

    assert.equal(summary.body.data.classes[0].rate, 120);
    assert.equal(summary.body.data.totals.lifetime, 120);
  });

  it('shows each viewer the rate that applies to them on the schedule', async () => {
    const { admin, teacher } = await rateSetup({ teacherRate: 150, classroomRate: 120, rate: 100 });

    const forTeacher = await request(app).get('/api/sessions').set(await auth(teacher));
    const forAdmin = await request(app).get('/api/sessions').set(await auth(admin));

    assert.equal(forTeacher.status, 200);
    assert.equal(forTeacher.body.data.items[0].rate, 150);
    // The rate set on the class itself stays available for editing.
    assert.equal(forTeacher.body.data.items[0].sessionRate, 100);
    assert.equal(forAdmin.body.data.items[0].rate, 100);
    assert.equal(forAdmin.body.data.items[0].sessionRate, 100);
  });

  it('lets an administrator assign an individual rate to a teacher', async () => {
    const { admin, teacher } = await rateSetup();

    const assigned = await request(app)
      .patch(`/api/users/${teacher.id}`)
      .set(await auth(admin))
      .send({ sessionRate: 175 });

    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.data.user.sessionRate, 175);

    const teachers = await request(app).get('/api/salary/teachers').set(await auth(admin));
    const listed = teachers.body.data.items.find((item) => item.teacher.id === teacher.id);
    assert.equal(listed.teacher.sessionRate, 175);
    assert.equal(teachers.body.data.defaultRate, 100);
  });

  it('lets an administrator set the rate on a classroom', async () => {
    const { admin, teacher } = await rateSetup();
    const room = await Classroom.create({ name: 'Rate room', teacher: teacher._id, teachers: [teacher._id] });

    const created = await request(app)
      .post('/api/classrooms')
      .set(await auth(admin))
      .send({ name: 'Another room', teacherIds: [teacher.id], studentIds: [], sessionRate: 130 });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.classroom.sessionRate, 130);

    const updated = await request(app)
      .patch(`/api/classrooms/${room.id}`)
      .set(await auth(admin))
      .send({ sessionRate: 140 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.classroom.sessionRate, 140);
  });
});

describe('earnings periods', () => {
  it('groups earnings by the calendar they are reported in', () => {
    // 17:00 UTC is the next day in Manila (UTC+8).
    assert.equal(localDateKey('2026-05-03T17:00:00Z', 'Asia/Manila'), '2026-05-04');
    assert.equal(localWeekKey('2026-05-04T00:00:00Z'), '2026-W19');
    assert.equal(localMonthKey('2026-05-04T00:00:00Z'), '2026-05');
    assert.deepEqual(calendarKeys(new Date('2026-05-06T12:00:00Z')), {
      day: '2026-05-06',
      week: '2026-W19',
      month: '2026-05',
    });
  });

  it('totals today, this week and this month', () => {
    const lines = [
      { amount: 100, dayKey: '2026-05-06', weekKey: '2026-W19', monthKey: '2026-05' },
      { amount: 50, dayKey: '2026-05-05', weekKey: '2026-W19', monthKey: '2026-05' },
      { amount: 25, dayKey: '2026-04-30', weekKey: '2026-W18', monthKey: '2026-04' },
    ];
    assert.deepEqual(calendarTotals(lines, calendarKeys(new Date('2026-05-06T12:00:00Z'))), {
      today: 100,
      week: 150,
      month: 150,
    });
  });

  it('groups daily, weekly and monthly buckets', () => {
    const startsAt = new Date('2026-05-06T09:00:00Z');
    const lines = [
      { startsAt, amount: 100, attendedMs: HOUR_MS, dayKey: '2026-05-06', weekKey: '2026-W19', monthKey: '2026-05' },
      { startsAt, amount: 50, attendedMs: HOUR_MS / 2, dayKey: '2026-05-06', weekKey: '2026-W19', monthKey: '2026-05' },
      { startsAt, amount: 25, attendedMs: 0, dayKey: '2026-04-30', weekKey: '2026-W18', monthKey: '2026-04' },
    ];

    assert.deepEqual(earningsBuckets(lines, 'day'), [
      { key: '2026-05-06', startedAt: startsAt, classes: 2, attendedMs: HOUR_MS * 1.5, earnings: 150 },
      { key: '2026-04-30', startedAt: startsAt, classes: 1, attendedMs: 0, earnings: 25 },
    ]);
    assert.deepEqual(earningsBuckets(lines, 'week').map(({ key, earnings }) => ({ key, earnings })), [
      { key: '2026-W19', earnings: 150 },
      { key: '2026-W18', earnings: 25 },
    ]);
    assert.deepEqual(earningsBuckets(lines, 'month').map(({ key, earnings }) => ({ key, earnings })), [
      { key: '2026-05', earnings: 150 },
      { key: '2026-04', earnings: 25 },
    ]);
  });
});

describe('class rate on the schedule', () => {
  const classPayload = (classroomId, startsAt) => ({
    classroomId,
    title: 'Math',
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + HOUR_MS).toISOString(),
    timezone: 'UTC',
  });

  it('gives a new class the school rate, and shows it to teachers and admins only', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const classroom = await addClassroom({ teacher, students: [student] });
    await SystemSettings.findByIdAndUpdate('system', { $set: { defaultSessionRate: 120 } }, { upsert: true });

    const created = await request(app)
      .post('/api/sessions')
      .set(await auth(admin))
      .send(classPayload(classroom.id, new Date(Date.now() + DAY_MS)));

    assert.equal(created.status, 201);
    assert.equal(created.body.data.items[0].rate, 120);

    const teacherList = await request(app).get('/api/sessions').set(await auth(teacher));
    assert.equal(teacherList.status, 200);
    assert.equal(teacherList.body.data.items[0].rate, 120);

    const studentList = await request(app).get('/api/sessions?view=mine').set(await auth(student));
    assert.equal(studentList.status, 200);
    assert.equal(studentList.body.data.items[0].rate, null);
  });

  it('keeps the rate a class was scheduled with when the school rate changes', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const classroom = await addClassroom({ teacher });

    const first = await request(app)
      .post('/api/sessions')
      .set(await auth(admin))
      .send(classPayload(classroom.id, new Date(Date.now() + DAY_MS)));
    assert.equal(first.body.data.items[0].rate, 100);

    await SystemSettings.findByIdAndUpdate('system', { $set: { defaultSessionRate: 200 } }, { upsert: true });
    const second = await request(app)
      .post('/api/sessions')
      .set(await auth(admin))
      .send(classPayload(classroom.id, new Date(Date.now() + 2 * DAY_MS)));

    assert.equal(second.body.data.items[0].rate, 200);
    const listed = await request(app).get('/api/sessions').set(await auth(admin));
    const rates = listed.body.data.items.map(({ rate }) => rate).sort((a, b) => a - b);
    assert.deepEqual(rates, [100, 200]);
  });

  it('lets a teacher set the rate for one class', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const classroom = await addClassroom({ teacher });
    const created = await request(app)
      .post('/api/sessions')
      .set(await auth(teacher))
      .send({ ...classPayload(classroom.id, new Date(Date.now() + DAY_MS)), rate: 250 });
    assert.equal(created.body.data.items[0].rate, 250);

    const updated = await request(app)
      .patch(`/api/sessions/${created.body.data.items[0].id}`)
      .set(await auth(teacher))
      .send({ scope: 'occurrence', rate: 175 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.items[0].rate, 175);

    // `null` puts the class back on the school rate.
    const reset = await request(app)
      .patch(`/api/sessions/${created.body.data.items[0].id}`)
      .set(await auth(teacher))
      .send({ scope: 'occurrence', rate: null });
    assert.equal(reset.body.data.items[0].rate, 100);
  });
});

describe('salary summary', () => {
  /** A teacher with a one-hour class (100) and a two-hour class attended for one hour (50). */
  async function earningsSetup() {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const other = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const classroom = await addClassroom({ teacher, students: [student] });
    await addFinishedClass({ classroom, teacher, daysAgo: 3, hours: 1, attendedMs: HOUR_MS });
    await addFinishedClass({ classroom, teacher, daysAgo: 2, hours: 2, attendedMs: HOUR_MS });
    await addFinishedClass({ classroom, teacher: other, daysAgo: 2, hours: 1, rate: 80, attendedMs: HOUR_MS });
    return { admin, teacher, other, student };
  }

  it('adds up the classes a teacher attended, prorated by time in the room', async () => {
    const { teacher } = await earningsSetup();

    const response = await request(app).get('/api/salary/summary').set(await auth(teacher));

    assert.equal(response.status, 200);
    assert.equal(response.body.data.defaultRate, 100);
    assert.equal(response.body.data.totals.lifetime, 150);
    assert.equal(response.body.data.balance.earned, 150);
    assert.equal(response.body.data.classes.length, 2);
    assert.equal(response.body.data.classes[0].amount, 50);
    assert.equal(response.body.data.classes[1].amount, 100);
    assert.equal(
      roundAmount(response.body.data.buckets.reduce((sum, bucket) => sum + bucket.earnings, 0)),
      150,
    );
  });

  it('groups the earnings by day, week or month on request', async () => {
    const { teacher } = await earningsSetup();

    const weekly = await request(app).get('/api/salary/summary?granularity=week').set(await auth(teacher));

    assert.equal(weekly.status, 200);
    assert.equal(weekly.body.data.granularity, 'week');
    assert.ok(weekly.body.data.buckets.every(({ key }) => /^\d{4}-W\d{2}$/.test(key)));
  });

  it('lets a teacher see only their own earnings', async () => {
    const { teacher, other } = await earningsSetup();

    const someoneElse = await request(app)
      .get(`/api/salary/summary?teacherId=${other.id}`)
      .set(await auth(teacher));

    assert.equal(someoneElse.status, 403);
  });

  it('lets an administrator look up any teacher, and asks which one', async () => {
    const { admin, teacher, other } = await earningsSetup();

    assert.equal((await request(app).get('/api/salary/summary').set(await auth(admin))).status, 400);

    const chosen = await request(app).get(`/api/salary/summary?teacherId=${teacher.id}`).set(await auth(admin));
    assert.equal(chosen.status, 200);
    assert.equal(chosen.body.data.teacher.id, teacher.id);
    assert.equal(chosen.body.data.totals.lifetime, 150);

    const theirs = await request(app).get(`/api/salary/summary?teacherId=${other.id}`).set(await auth(admin));
    assert.equal(theirs.body.data.totals.lifetime, 80);
  });

  it('keeps students out of the salary module', async () => {
    const { student, teacher } = await earningsSetup();

    assert.equal((await request(app).get('/api/salary/summary').set(await auth(student))).status, 403);
    assert.equal((await request(app).get('/api/salary/withdrawals').set(await auth(student))).status, 403);
    assert.equal((await request(app).get('/api/salary/teachers').set(await auth(teacher))).status, 403);
  });

  it('lists every teacher with their period and lifetime totals', async () => {
    const { admin, teacher, other } = await earningsSetup();

    const response = await request(app).get('/api/salary/teachers').set(await auth(admin));

    assert.equal(response.status, 200);
    assert.equal(response.body.data.defaultRate, 100);
    assert.equal(response.body.data.pagination.total, 2);
    const byId = new Map(response.body.data.items.map((item) => [item.teacher.id, item]));
    assert.equal(byId.get(teacher.id).totals.lifetime, 150);
    assert.equal(byId.get(teacher.id).balance.available, 150);
    assert.equal(byId.get(teacher.id).minutes, 120);
    assert.equal(byId.get(other.id).totals.lifetime, 80);
  });
});

describe('withdrawals', () => {
  /** A teacher with 100 earned: one one-hour class at the default rate. */
  async function withdrawSetup() {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    const classroom = await addClassroom({ teacher });
    await addFinishedClass({ classroom, teacher, daysAgo: 2, hours: 1, attendedMs: HOUR_MS });
    return { admin, teacher };
  }

  it('lets a teacher take out what they have earned, and no more', async () => {
    const { teacher } = await withdrawSetup();

    const requested = await request(app)
      .post('/api/salary/withdrawals')
      .set(await auth(teacher))
      .send({ amount: 40, method: 'cash', note: 'Friday' });
    assert.equal(requested.status, 201);
    assert.equal(requested.body.data.withdrawal.amount, 40);
    assert.equal(requested.body.data.withdrawal.status, 'pending');
    assert.equal(requested.body.data.withdrawal.teacher.id, teacher.id);

    const tooMuch = await request(app)
      .post('/api/salary/withdrawals')
      .set(await auth(teacher))
      .send({ amount: 61 });
    assert.equal(tooMuch.status, 400);
    assert.match(tooMuch.body.error, /60/);

    const summary = await request(app).get('/api/salary/summary').set(await auth(teacher));
    assert.equal(summary.body.data.balance.earned, 100);
    assert.equal(summary.body.data.balance.pending, 40);
    assert.equal(summary.body.data.balance.available, 60);

    const remaining = await request(app)
      .post('/api/salary/withdrawals')
      .set(await auth(teacher))
      .send({ amount: 60 });
    assert.equal(remaining.status, 201);
  });

  it('shows a teacher their own requests, and an administrator every request', async () => {
    const { admin, teacher } = await withdrawSetup();
    await request(app).post('/api/salary/withdrawals').set(await auth(teacher)).send({ amount: 25 });

    const mine = await request(app).get('/api/salary/withdrawals').set(await auth(teacher));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.items.length, 1);

    const all = await request(app).get('/api/salary/withdrawals?status=pending').set(await auth(admin));
    assert.equal(all.status, 200);
    assert.equal(all.body.data.items.length, 1);
    assert.equal(all.body.data.items[0].teacher.id, teacher.id);

    const none = await request(app).get('/api/salary/withdrawals?status=approved').set(await auth(admin));
    assert.equal(none.body.data.items.length, 0);
  });

  it('is approved by an administrator, which moves it out of the balance', async () => {
    const { admin, teacher } = await withdrawSetup();
    const requested = await request(app)
      .post('/api/salary/withdrawals')
      .set(await auth(teacher))
      .send({ amount: 40 });
    const { id } = requested.body.data.withdrawal;

    const byTeacher = await request(app)
      .patch(`/api/salary/withdrawals/${id}`)
      .set(await auth(teacher))
      .send({ status: 'approved' });
    assert.equal(byTeacher.status, 403);

    const approved = await request(app)
      .patch(`/api/salary/withdrawals/${id}`)
      .set(await auth(admin))
      .send({ status: 'approved', reviewNote: 'Paid at the desk' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.withdrawal.status, 'approved');
    assert.equal(approved.body.data.withdrawal.reviewedBy.id, admin.id);
    assert.equal(approved.body.data.withdrawal.reviewNote, 'Paid at the desk');

    const summary = await request(app).get('/api/salary/summary').set(await auth(teacher));
    assert.equal(summary.body.data.balance.withdrawn, 40);
    assert.equal(summary.body.data.balance.pending, 0);
    assert.equal(summary.body.data.balance.available, 60);

    // A request that has been dealt with cannot be reviewed twice.
    const again = await request(app)
      .patch(`/api/salary/withdrawals/${id}`)
      .set(await auth(admin))
      .send({ status: 'rejected' });
    assert.equal(again.status, 400);
  });

  it('lets a teacher cancel a request that is still waiting', async () => {
    const { admin, teacher } = await withdrawSetup();
    const requested = await request(app)
      .post('/api/salary/withdrawals')
      .set(await auth(teacher))
      .send({ amount: 30 });
    const { id } = requested.body.data.withdrawal;

    const cancelled = await request(app).delete(`/api/salary/withdrawals/${id}`).set(await auth(teacher));
    assert.equal(cancelled.status, 200);
    assert.equal(await SalaryWithdrawal.countDocuments(), 0);

    const missing = await request(app)
      .patch(`/api/salary/withdrawals/${id}`)
      .set(await auth(admin))
      .send({ status: 'approved' });
    assert.equal(missing.status, 404);
  });

  it('only teachers may ask for a withdrawal', async () => {
    const { admin } = await withdrawSetup();

    const response = await request(app)
      .post('/api/salary/withdrawals')
      .set(await auth(admin))
      .send({ amount: 10 });

    assert.equal(response.status, 403);
  });
});