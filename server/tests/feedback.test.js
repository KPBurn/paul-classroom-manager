import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { Classroom } from '../src/models/Classroom.js';
import { ClassSession } from '../src/models/ClassSession.js';
import { TeacherFeedback } from '../src/models/TeacherFeedback.js';

const app = createApp();
const login = async (user) => {
  const response = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(response.status, 200);
  return response.body.data.token;
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const completeContent = {
  book: 'GET READY FOR IELTS 6.5–7.5',
  whatWeLearned: 'Introducing yourself and answering basic speaking questions.',
  vocabulary: { newWords: 'confident, pronunciation', independentWords: 'introduction' },
  grammar: { topic: 'Getting to Know You', understanding: 'Good', accuracy: 'Some errors with articles' },
  speaking: { fluency: 4, pronunciation: 3, confidence: 5 },
  didWell: 'Shared ideas confidently.',
  needsImprovement: 'Pronunciation of final consonants.',
  recommendation: 'Practise longer speaking responses.',
};

before(startDatabase);
after(stopDatabase);
beforeEach(clearDatabase);

async function setup() {
  const teacher = await createUser({ role: 'teacher' });
  const coTeacher = await createUser({ role: 'teacher' });
  const otherTeacher = await createUser({ role: 'teacher' });
  const admin = await createUser({ role: 'admin' });
  const duke = await createUser({ role: 'student', firstName: 'Duc Hung', lastName: 'Hoang' });
  const mai = await createUser({ role: 'student', firstName: 'Mai', lastName: 'Tran' });
  const outsider = await createUser({ role: 'student' });
  const classroom = await Classroom.create({
    name: 'IELTS 6001',
    teacher: teacher._id,
    teachers: [teacher._id, coTeacher._id],
    students: [duke._id, mai._id],
  });
  const lesson = await ClassSession.create({
    classroom: classroom._id,
    title: 'Speaking practice',
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() - 60 * 60 * 1000),
  });
  return {
    teacher,
    duke,
    mai,
    outsider,
    classroom,
    lesson,
    teacherToken: await login(teacher),
    coTeacherToken: await login(coTeacher),
    otherTeacherToken: await login(otherTeacher),
    adminToken: await login(admin),
    studentToken: await login(duke),
  };
}

describe('teacher feedback', () => {
  it('saves a draft, then submits it once the required sections are filled', async () => {
    const { lesson, duke, teacher, teacherToken } = await setup();

    const draft = await request(app).post('/api/feedback').set(auth(teacherToken)).send({
      sessionId: lesson.id,
      studentId: duke.id,
      whatWeLearned: 'Introductions',
      speaking: { fluency: 4 },
    });
    assert.equal(draft.status, 201);
    assert.equal(draft.body.data.feedback.status, 'draft');
    assert.equal(draft.body.data.feedback.classroom.name, 'IELTS 6001');
    assert.equal(draft.body.data.feedback.student.name, 'Duc Hung Hoang');
    assert.equal(draft.body.data.feedback.teacher.id, teacher.id);
    const id = draft.body.data.feedback.id;

    const incomplete = await request(app).patch(`/api/feedback/${id}`).set(auth(teacherToken)).send({ status: 'completed' });
    assert.equal(incomplete.status, 400);
    assert.ok(incomplete.body.details.some((detail) => detail.field === 'didWell'));
    assert.equal((await TeacherFeedback.findById(id)).status, 'draft');

    const submitted = await request(app)
      .patch(`/api/feedback/${id}`)
      .set(auth(teacherToken))
      .send({ ...completeContent, status: 'completed' });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.data.feedback.status, 'completed');
    assert.ok(submitted.body.data.feedback.submittedAt);
    assert.equal(submitted.body.data.feedback.speaking.confidence, 5);
    assert.equal(submitted.body.data.feedback.vocabulary.independentWords, 'introduction');

    // Later edits keep it submitted, but still have to stay complete.
    const cleared = await request(app).patch(`/api/feedback/${id}`).set(auth(teacherToken)).send({ didWell: '' });
    assert.equal(cleared.status, 400);
    assert.ok(await ActivityLog.exists({ action: 'feedback.submitted' }));
  });

  it('keeps one record per student per lesson and shows progress for the class', async () => {
    const { lesson, duke, mai, teacherToken } = await setup();
    await request(app).post('/api/feedback').set(auth(teacherToken)).send({
      sessionId: lesson.id, studentId: duke.id, ...completeContent, status: 'completed',
    });
    const duplicate = await request(app).post('/api/feedback').set(auth(teacherToken)).send({
      sessionId: lesson.id, studentId: duke.id,
    });
    assert.equal(duplicate.status, 409);
    await request(app).post('/api/feedback').set(auth(teacherToken)).send({ sessionId: lesson.id, studentId: mai.id });

    const roster = await request(app).get(`/api/feedback/lessons/${lesson.id}`).set(auth(teacherToken));
    assert.equal(roster.status, 200);
    assert.equal(roster.body.data.suggestedBook, completeContent.book);
    assert.deepEqual(
      roster.body.data.students.map((student) => [student.name, student.feedback?.status]),
      [['Duc Hung Hoang', 'completed'], ['Mai Tran', 'draft']],
    );

    const drafts = await request(app).get('/api/feedback?status=draft').set(auth(teacherToken));
    assert.equal(drafts.body.data.items.length, 1);
    assert.equal(drafts.body.data.items[0].student.name, 'Mai Tran');
  });

  it('limits writing to the lesson teacher and keeps students out entirely', async () => {
    const { lesson, duke, outsider, coTeacherToken, otherTeacherToken, adminToken, studentToken, teacherToken } = await setup();
    const payload = { sessionId: lesson.id, studentId: duke.id };

    assert.equal((await request(app).post('/api/feedback').set(auth(otherTeacherToken)).send(payload)).status, 403);
    assert.equal((await request(app).post('/api/feedback').set(auth(studentToken)).send(payload)).status, 403);
    assert.equal((await request(app).post('/api/feedback').set(auth(adminToken)).send(payload)).status, 403);
    assert.equal(
      (await request(app).post('/api/feedback').set(auth(teacherToken)).send({ ...payload, studentId: outsider.id })).status,
      400,
    );
    assert.equal((await request(app).get(`/api/feedback/lessons/${lesson.id}`).set(auth(otherTeacherToken))).status, 403);
    assert.equal((await request(app).get('/api/feedback').set(auth(studentToken))).status, 403);

    const created = await request(app).post('/api/feedback').set(auth(teacherToken)).send(payload);
    const id = created.body.data.feedback.id;
    // Co-teachers of the lesson can read it but not change it; unrelated teachers cannot read it.
    assert.equal((await request(app).get(`/api/feedback/${id}`).set(auth(coTeacherToken))).status, 200);
    assert.equal((await request(app).patch(`/api/feedback/${id}`).set(auth(coTeacherToken)).send({ notes: 'x' })).status, 403);
    assert.equal((await request(app).get(`/api/feedback/${id}`).set(auth(otherTeacherToken))).status, 403);
    assert.equal((await request(app).get(`/api/feedback/${id}`).set(auth(studentToken))).status, 403);

    const adminView = await request(app).get(`/api/feedback/${id}`).set(auth(adminToken));
    assert.equal(adminView.status, 200);
    assert.ok(adminView.body.data.feedback.teacher.name);
    const adminList = await request(app).get('/api/feedback').set(auth(adminToken));
    assert.equal(adminList.body.data.items.length, 1);
    const otherTeachersList = await request(app).get('/api/feedback').set(auth(otherTeacherToken));
    assert.equal(otherTeachersList.body.data.items.length, 0);
  });

  it('lists lessons still needing feedback and offers the lesson details to reuse', async () => {
    const { lesson, duke, mai, teacherToken, otherTeacherToken } = await setup();

    const before = await request(app).get('/api/feedback/pending').set(auth(teacherToken));
    assert.equal(before.status, 200);
    assert.equal(before.body.data.items.length, 1);
    assert.equal(before.body.data.items[0].nextStudent.name, 'Duc Hung Hoang');
    assert.equal(before.body.data.items[0].completed, 0);
    assert.equal((await request(app).get('/api/feedback/pending').set(auth(otherTeacherToken))).body.data.items.length, 0);

    await request(app).post('/api/feedback').set(auth(teacherToken)).send({
      sessionId: lesson.id, studentId: duke.id, ...completeContent, status: 'completed',
    });
    const roster = await request(app).get(`/api/feedback/lessons/${lesson.id}`).set(auth(teacherToken));
    assert.equal(roster.body.data.lessonDefaults.fromStudent.name, 'Duc Hung Hoang');
    assert.equal(roster.body.data.lessonDefaults.whatWeLearned, completeContent.whatWeLearned);
    assert.equal(roster.body.data.lessonDefaults.grammarTopic, 'Getting to Know You');

    const middle = await request(app).get('/api/feedback/pending').set(auth(teacherToken));
    assert.equal(middle.body.data.items[0].nextStudent.name, 'Mai Tran');
    assert.equal(middle.body.data.items[0].completed, 1);

    await request(app).post('/api/feedback').set(auth(teacherToken)).send({
      sessionId: lesson.id, studentId: mai.id, ...completeContent, status: 'completed',
    });
    const after = await request(app).get('/api/feedback/pending').set(auth(teacherToken));
    assert.deepEqual(after.body.data.items, []);
  });

  it('totals unfinished feedback for reminders and marks lessons older than a week as overdue', async () => {
    const { classroom, lesson, duke, teacherToken } = await setup();
    const day = 24 * 60 * 60 * 1000;
    await ClassSession.create({
      classroom: classroom._id, title: 'Older lesson', startsAt: new Date(Date.now() - 10 * day), endsAt: new Date(Date.now() - 10 * day + 3_600_000),
    });
    await ClassSession.create({
      classroom: classroom._id, title: 'Too old to remind', startsAt: new Date(Date.now() - 20 * day), endsAt: new Date(Date.now() - 20 * day + 3_600_000),
    });
    await request(app).post('/api/feedback').set(auth(teacherToken)).send({
      sessionId: lesson.id, studentId: duke.id, ...completeContent, status: 'completed',
    });

    const pending = await request(app).get('/api/feedback/pending').set(auth(teacherToken));
    assert.deepEqual(pending.body.data.summary, { lessons: 2, students: 3, overdueLessons: 1, overdueStudents: 2 });
    assert.deepEqual(
      pending.body.data.items.map((item) => [item.lesson.title, item.left, item.overdue]),
      [['Speaking practice', 1, false], ['Older lesson', 2, true]],
    );
  });

  it('rejects out-of-range ratings and cancelled lessons', async () => {
    const { lesson, duke, teacherToken } = await setup();
    const badRating = await request(app).post('/api/feedback').set(auth(teacherToken)).send({
      sessionId: lesson.id, studentId: duke.id, speaking: { fluency: 6 },
    });
    assert.equal(badRating.status, 400);

    lesson.status = 'cancelled';
    await lesson.save();
    const cancelled = await request(app).post('/api/feedback').set(auth(teacherToken)).send({
      sessionId: lesson.id, studentId: duke.id,
    });
    assert.equal(cancelled.status, 400);
  });
});
