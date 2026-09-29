import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { clearDatabase, createUser, startDatabase, stopDatabase, TEST_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';
import { Classroom } from '../src/models/Classroom.js';
import { Subject } from '../src/models/Subject.js';
import { SubjectMaterial } from '../src/models/SubjectMaterial.js';

const app = createApp();
const login = async (user) => {
  const response = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  assert.equal(response.status, 200);
  return response.body.data.token;
};
const auth = (token) => ({ Authorization: ['Bearer', token].join(' ') });

before(startDatabase);
after(stopDatabase);
beforeEach(clearDatabase);

describe('subject materials', () => {
  it('lets an assigned teacher create subjects and upload materials for a class', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const otherTeacher = await createUser({ role: 'teacher' });
    const outsider = await createUser({ role: 'student' });
    const teacherToken = await login(teacher);
    const studentToken = await login(student);
    const otherTeacherToken = await login(otherTeacher);
    const outsiderToken = await login(outsider);
    const classroom = await Classroom.create({
      name: '2021',
      teacher: teacher._id,
      students: [student._id],
    });

    const created = await request(app)
      .post('/api/subjects')
      .set(auth(teacherToken))
      .send({ name: ' English 101 ', classroomId: String(classroom._id) });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.subject.name, 'English 101');
    assert.equal(created.body.data.subject.classroom.name, '2021');
    assert.deepEqual(created.body.data.subject.materials, []);
    assert.equal(await Subject.countDocuments(), 1);

    const forbidden = await request(app)
      .post('/api/subjects')
      .set(auth(otherTeacherToken))
      .send({ name: 'English 102', classroomId: String(classroom._id) });
    assert.equal(forbidden.status, 403);

    const subjectId = created.body.data.subject.id;
    const futureRelease = new Date(Date.now() + 60_000).toISOString();
    const uploaded = await request(app)
      .post(`/api/subjects/${subjectId}/materials`)
      .set(auth(teacherToken))
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', 'reading%20list.pdf')
      .set('X-Available-At', futureRelease)
      .send(Buffer.from('class reading material'));
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.data.material.name, 'reading list.pdf');
    assert.equal(uploaded.body.data.material.availableAt, futureRelease);

    const studentSubjects = await request(app).get('/api/subjects').set(auth(studentToken));
    assert.equal(studentSubjects.status, 200);
    assert.equal(studentSubjects.body.data.items.length, 1);
    assert.equal(studentSubjects.body.data.items[0].materials[0].name, 'reading list.pdf');
    assert.equal('data' in studentSubjects.body.data.items[0].materials[0], false);

    const lockedDownload = await request(app)
      .get(`/api/subjects/${subjectId}/materials/${uploaded.body.data.material.id}`)
      .set(auth(studentToken));
    assert.equal(lockedDownload.status, 403);

    const teacherDownload = await request(app)
      .get(`/api/subjects/${subjectId}/materials/${uploaded.body.data.material.id}`)
      .set(auth(teacherToken));
    assert.equal(teacherDownload.status, 200);
    assert.deepEqual(teacherDownload.body, Buffer.from('class reading material'));

    await SubjectMaterial.findByIdAndUpdate(uploaded.body.data.material.id, { availableAt: new Date(Date.now() - 1000) });
    const availableDownload = await request(app)
      .get(`/api/subjects/${subjectId}/materials/${uploaded.body.data.material.id}`)
      .set(auth(studentToken));
    assert.equal(availableDownload.status, 200);
    assert.equal(availableDownload.headers['content-type'], 'application/octet-stream');
    assert.deepEqual(availableDownload.body, Buffer.from('class reading material'));

    const outsiderSubjects = await request(app).get('/api/subjects').set(auth(outsiderToken));
    assert.deepEqual(outsiderSubjects.body.data.items, []);
    const outsiderAccess = await request(app)
      .get(`/api/subjects/${subjectId}`)
      .set(auth(outsiderToken));
    assert.equal(outsiderAccess.status, 404);
  });

  it('rejects malformed release dates and invalid subject assignments', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const token = await login(teacher);
    const classroom = await Classroom.create({ name: 'Batch 2021', teacher: teacher._id });

    const unassigned = await request(app)
      .post('/api/subjects')
      .set(auth(token))
      .send({ name: 'English 101', classroomId: '000000000000000000000000' });
    assert.equal(unassigned.status, 404);

    const created = await Subject.create({
      name: 'English 101',
      classroom: classroom._id,
      createdBy: teacher._id,
    });
    const badRelease = await request(app)
      .post(`/api/subjects/${created.id}/materials`)
      .set(auth(token))
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', 'notes.pdf')
      .set('X-Available-At', 'not-a-date')
      .send(Buffer.from('notes'));
    assert.equal(badRelease.status, 400);
    assert.equal(await SubjectMaterial.countDocuments(), 0);
  });

  it('stores titles and file types, previews safe images, and lets the teacher remove materials', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser({ role: 'student' });
    const teacherToken = await login(teacher);
    const studentToken = await login(student);
    const classroom = await Classroom.create({ name: 'Grade 5', teacher: teacher._id, students: [student._id] });
    const subject = await Subject.create({ name: 'Science', classroom: classroom._id, createdBy: teacher._id });
    const upload = (fileName, fileType, extra = {}) => {
      const req = request(app)
        .post(`/api/subjects/${subject.id}/materials`)
        .set(auth(teacherToken))
        .set('Content-Type', 'application/octet-stream')
        .set('X-File-Name', fileName)
        .set('X-File-Type', fileType);
      for (const [header, value] of Object.entries(extra)) req.set(header, value);
      return req.send(Buffer.from('file bytes'));
    };

    const image = await upload('leaf.png', 'image/png', {
      'X-Material-Title': encodeURIComponent('Leaf diagram'),
      'X-Material-Description': encodeURIComponent('Label each part before Friday.'),
    });
    assert.equal(image.status, 201);
    assert.equal(image.body.data.material.title, 'Leaf diagram');
    assert.equal(image.body.data.material.description, 'Label each part before Friday.');
    assert.equal(image.body.data.material.contentType, 'image/png');

    const imageDownload = await request(app)
      .get(`/api/subjects/${subject.id}/materials/${image.body.data.material.id}`)
      .set(auth(studentToken));
    assert.equal(imageDownload.headers['content-type'], 'image/png');

    // Script-capable types are stored but only ever served as downloads.
    const svg = await upload('drawing.svg', 'image/svg+xml');
    assert.equal(svg.body.data.material.contentType, 'image/svg+xml');
    const svgDownload = await request(app)
      .get(`/api/subjects/${subject.id}/materials/${svg.body.data.material.id}`)
      .set(auth(studentToken));
    assert.equal(svgDownload.headers['content-type'], 'application/octet-stream');
    const badType = await upload('notes.txt', 'not a type');
    assert.equal(badType.body.data.material.contentType, 'application/octet-stream');

    const studentDelete = await request(app)
      .delete(`/api/subjects/${subject.id}/materials/${image.body.data.material.id}`)
      .set(auth(studentToken));
    assert.equal(studentDelete.status, 403);
    const teacherDelete = await request(app)
      .delete(`/api/subjects/${subject.id}/materials/${image.body.data.material.id}`)
      .set(auth(teacherToken));
    assert.equal(teacherDelete.status, 200);
    assert.equal(await SubjectMaterial.exists({ _id: image.body.data.material.id }), null);
  });
});
