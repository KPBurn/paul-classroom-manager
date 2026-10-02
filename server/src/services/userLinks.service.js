import { classroomsTaughtBy, classroomTeacherIds } from '../authz/policies.js';
import { Announcement } from '../models/Announcement.js';
import { Classroom } from '../models/Classroom.js';
import { ClassSession } from '../models/ClassSession.js';
import { Subject } from '../models/Subject.js';
import { SubjectMaterial } from '../models/SubjectMaterial.js';
import { TeacherFeedback } from '../models/TeacherFeedback.js';
import { AppError } from '../utils/AppError.js';

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const listOf = (items) => (items.length > 1
  ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
  : items[0] ?? '');

/**
 * What still refers to a user, as phrases such as "2 classrooms". Deleting the
 * account would leave these records pointing at nobody, so an account with any
 * of them is deactivated instead.
 */
export async function recordsLinkedTo(user) {
  const id = user._id;
  const [classrooms, sessions, feedback, announcements, subjects, materials] = await Promise.all([
    Classroom.countDocuments({ $or: [{ teacher: id }, { teachers: id }, { students: id }] }),
    ClassSession.countDocuments({
      $or: [
        { assignedTeachers: id },
        { assignedStudents: id },
        { 'attendance.participant': id },
        { 'attendance.student': id },
      ],
    }),
    TeacherFeedback.countDocuments({ $or: [{ teacher: id }, { student: id }] }),
    Announcement.countDocuments({ createdBy: id }),
    Subject.countDocuments({ createdBy: id }),
    SubjectMaterial.countDocuments({ uploader: id }),
  ]);
  return [
    [classrooms, 'classroom'],
    [sessions, 'session'],
    [feedback, 'feedback record'],
    [announcements, 'announcement'],
    [subjects + materials, 'class material'],
  ]
    .filter(([count]) => count > 0)
    .map(([count, noun]) => plural(count, noun));
}

export async function assertDeletable(user) {
  const links = await recordsLinkedTo(user);
  if (links.length) {
    throw new AppError(
      409,
      `${user.fullName} is still linked to ${listOf(links)}, so the account cannot be deleted. Set its status to Inactive instead.`,
    );
  }
}

/** Sessions that have not finished yet; finished ones keep their people as a record of who was there. */
const upcoming = () => ({ status: 'scheduled', endsAt: { $gt: new Date() } });

/**
 * Takes a user out of the active classrooms and unfinished sessions that their
 * current role put them in, ready for a change of role. A teacher who is the
 * only teacher of a classroom has to be replaced there first. Returns the names
 * of the classrooms they left.
 */
export async function leaveClassrooms(user) {
  const id = user._id;

  if (user.role === 'teacher') {
    const classrooms = await Classroom.find({ status: 'active', ...classroomsTaughtBy(user) });
    const remainingTeachers = (classroom) => classroomTeacherIds(classroom).filter((teacherId) => teacherId !== String(id));
    const onlyTeacherOf = classrooms.filter((classroom) => remainingTeachers(classroom).length === 0);
    if (onlyTeacherOf.length) {
      throw new AppError(
        409,
        `${user.fullName} is the only teacher of ${listOf(onlyTeacherOf.map(({ name }) => name))}. Assign another teacher there before changing this role.`,
      );
    }

    for (const classroom of classrooms) {
      const teachers = remainingTeachers(classroom);
      classroom.teachers = teachers;
      [classroom.teacher] = teachers;
      await classroom.save();
    }
    await ClassSession.updateMany({ ...upcoming(), assignedTeachers: id }, { $pull: { assignedTeachers: id } });
    // A session must keep a teacher: one left with none takes its classroom's teachers.
    const unstaffed = await ClassSession.find({ ...upcoming(), assignedTeachers: { $size: 0 } }).distinct('classroom');
    for (const classroom of await Classroom.find({ _id: { $in: unstaffed } })) {
      await ClassSession.updateMany(
        { ...upcoming(), classroom: classroom._id, assignedTeachers: { $size: 0 } },
        { $set: { assignedTeachers: classroomTeacherIds(classroom) } },
      );
    }
    return classrooms.map(({ name }) => name);
  }

  if (user.role === 'student') {
    const classrooms = await Classroom.find({ status: 'active', students: id }).select('name');
    await Classroom.updateMany({ status: 'active', students: id }, { $pull: { students: id } });
    await ClassSession.updateMany({ ...upcoming(), assignedStudents: id }, { $pull: { assignedStudents: id } });
    return classrooms.map(({ name }) => name);
  }

  return [];
}
