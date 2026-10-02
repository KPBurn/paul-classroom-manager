/**
 * Who may do what with a classroom or a session. Every service and the live
 * room ask these functions, so a rule is written once and changed in one place.
 *
 * Roles (config/permissions.js) answer "what kind of account is this"; the
 * functions here answer "is this account connected to this class or lesson".
 *
 * They accept documents with populated or unpopulated references.
 */

const idOf = (value) => String(value?._id ?? value);
const idsOf = (values) => (values ?? []).filter(Boolean).map(idOf);
const isRole = (user, role) => user?.role === role;

/** A classroom's teachers. `teacher` is the older single field and is kept in step with `teachers`. */
export const classroomTeacherIds = (classroom) => [
  ...new Set(idsOf([classroom?.teacher, ...(classroom?.teachers ?? [])])),
];

/** A session keeps its own list of people; sessions made before that existed fall back to the classroom. */
export const sessionTeacherIds = (session) => (session.assignedTeachers
  ? idsOf(session.assignedTeachers)
  : classroomTeacherIds(session.classroom));

export const sessionStudentIds = (session) => idsOf(session.assignedStudents ?? session.classroom?.students);

/** The MongoDB filter for the classrooms a teacher is assigned to. */
export const classroomsTaughtBy = (user) => ({ $or: [{ teacher: user._id }, { teachers: user._id }] });

// Classrooms

export const teachesClassroom = (classroom, user) => isRole(user, 'teacher')
  && classroomTeacherIds(classroom).includes(idOf(user));

export const isEnrolledIn = (classroom, user) => isRole(user, 'student')
  && idsOf(classroom?.students).includes(idOf(user));

/** Administrators and the classroom's own teachers. */
export const canManageClassroom = (classroom, user) => isRole(user, 'admin') || teachesClassroom(classroom, user);

/** Everyone who can manage the classroom, plus the students enrolled in it. */
export const canReadClassroom = (classroom, user) => canManageClassroom(classroom, user)
  || isEnrolledIn(classroom, user);

// Sessions

export const isSessionTeacher = (session, user) => isRole(user, 'teacher')
  && sessionTeacherIds(session).includes(idOf(user));

export const isSessionStudent = (session, user) => isRole(user, 'student')
  && sessionStudentIds(session).includes(idOf(user));

/** Administrators and the session's own teachers: they edit it, take attendance and run its room. */
export const canManageSession = (session, user) => isRole(user, 'admin') || isSessionTeacher(session, user);

/** The session's people, plus any signed-in account when its classroom is open to everyone. */
export const canJoinSession = (session, user) => canManageSession(session, user)
  || isSessionStudent(session, user)
  || Boolean(session.classroom?.openAccess);
