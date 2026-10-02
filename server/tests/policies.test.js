import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canJoinSession,
  canManageClassroom,
  canManageSession,
  canReadClassroom,
  classroomsTaughtBy,
  classroomTeacherIds,
  isEnrolledIn,
  isSessionStudent,
  isSessionTeacher,
  sessionStudentIds,
  sessionTeacherIds,
  teachesClassroom,
} from '../src/authz/policies.js';

const user = (id, role) => ({ _id: id, role });
const admin = user('a1', 'admin');
const teacher = user('t1', 'teacher');
const coTeacher = user('t2', 'teacher');
const otherTeacher = user('t3', 'teacher');
const student = user('s1', 'student');
const otherStudent = user('s2', 'student');

// `teachers` holds populated documents and `students` plain ids, as services pass either.
const classroom = { teacher: 't1', teachers: [{ _id: 't1' }, { _id: 't2' }], students: ['s1'] };

describe('classroom policies', () => {
  it('lists each teacher once, from the single field and the list', () => {
    assert.deepEqual(classroomTeacherIds(classroom), ['t1', 't2']);
    assert.deepEqual(classroomTeacherIds({ teacher: 't1' }), ['t1']);
    assert.deepEqual(classroomTeacherIds(undefined), []);
  });

  it('recognises the classroom’s teachers and enrolled students', () => {
    assert.equal(teachesClassroom(classroom, teacher), true);
    assert.equal(teachesClassroom(classroom, coTeacher), true);
    assert.equal(teachesClassroom(classroom, otherTeacher), false);
    assert.equal(isEnrolledIn(classroom, student), true);
    assert.equal(isEnrolledIn(classroom, otherStudent), false);
  });

  it('goes by the account’s current role, not only its id', () => {
    // Someone still listed as a teacher after becoming a student must not keep teacher access.
    assert.equal(teachesClassroom(classroom, user('t1', 'student')), false);
    assert.equal(isEnrolledIn(classroom, user('s1', 'teacher')), false);
    assert.equal(teachesClassroom(classroom, undefined), false);
  });

  it('lets admins and the classroom’s teachers manage, and enrolled students read', () => {
    assert.equal(canManageClassroom(classroom, admin), true);
    assert.equal(canManageClassroom(classroom, teacher), true);
    assert.equal(canManageClassroom(classroom, otherTeacher), false);
    assert.equal(canManageClassroom(classroom, student), false);
    assert.equal(canReadClassroom(classroom, student), true);
    assert.equal(canReadClassroom(classroom, otherStudent), false);
    assert.equal(canReadClassroom(classroom, otherTeacher), false);
  });

  it('builds the filter for a teacher’s classrooms', () => {
    assert.deepEqual(classroomsTaughtBy(teacher), { $or: [{ teacher: 't1' }, { teachers: 't1' }] });
  });
});

describe('session policies', () => {
  const session = { assignedTeachers: ['t2'], assignedStudents: [{ _id: 's2' }], classroom };
  const olderSession = { classroom };

  it('uses the session’s own people when it has them', () => {
    assert.deepEqual(sessionTeacherIds(session), ['t2']);
    assert.deepEqual(sessionStudentIds(session), ['s2']);
    assert.equal(isSessionTeacher(session, coTeacher), true);
    // In the classroom, but not part of this session.
    assert.equal(isSessionTeacher(session, teacher), false);
    assert.equal(isSessionStudent(session, otherStudent), true);
    assert.equal(isSessionStudent(session, student), false);
  });

  it('falls back to the classroom for sessions without their own list', () => {
    assert.deepEqual(sessionTeacherIds(olderSession), ['t1', 't2']);
    assert.deepEqual(sessionStudentIds(olderSession), ['s1']);
    assert.equal(isSessionTeacher(olderSession, teacher), true);
    assert.equal(isSessionStudent(olderSession, student), true);
  });

  it('lets admins and the session’s teachers manage it', () => {
    assert.equal(canManageSession(session, admin), true);
    assert.equal(canManageSession(session, coTeacher), true);
    assert.equal(canManageSession(session, teacher), false);
    assert.equal(canManageSession(session, otherStudent), false);
  });

  it('lets the session’s people join, and anyone when the classroom is open', () => {
    assert.equal(canJoinSession(session, admin), true);
    assert.equal(canJoinSession(session, coTeacher), true);
    assert.equal(canJoinSession(session, otherStudent), true);
    assert.equal(canJoinSession(session, student), false);
    assert.equal(canJoinSession(session, otherTeacher), false);

    const open = { ...session, classroom: { ...classroom, openAccess: true } };
    assert.equal(canJoinSession(open, student), true);
    assert.equal(canJoinSession(open, otherTeacher), true);
  });
});
