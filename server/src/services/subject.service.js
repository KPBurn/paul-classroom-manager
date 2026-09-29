import { Classroom } from '../models/Classroom.js';
import { Subject } from '../models/Subject.js';
import { SubjectMaterial } from '../models/SubjectMaterial.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../utils/activityLogger.js';

function teacherAssignedTo(classroom, user) {
  const teacherIds = [classroom.teacher, ...(classroom.teachers ?? [])]
    .filter(Boolean)
    .map((teacher) => String(teacher._id ?? teacher));
  return teacherIds.includes(String(user._id));
}

function isClassMember(classroom, user) {
  return classroom.students.some((student) => String(student._id ?? student) === String(user._id));
}

function subjectMaterialResult(material, includeUploader = false) {
  return {
    id: String(material._id),
    name: material.name,
    size: material.size,
    availableAt: material.availableAt,
    uploadedAt: material.createdAt,
    ...(includeUploader && {
      uploader: material.uploader
        ? {
            id: String(material.uploader._id ?? material.uploader),
            name: `${material.uploader.firstName ?? ''} ${material.uploader.lastName ?? ''}`.trim(),
          }
        : null,
    }),
  };
}

function subjectResult(subject, materials = []) {
  return {
    id: String(subject._id),
    name: subject.name,
    description: subject.description,
    classroom: {
      id: String(subject.classroom._id),
      name: subject.classroom.name,
      status: subject.classroom.status,
    },
    createdBy: subject.createdBy
      ? {
          id: String(subject.createdBy._id ?? subject.createdBy),
          name: `${subject.createdBy.firstName ?? ''} ${subject.createdBy.lastName ?? ''}`.trim(),
        }
      : null,
    createdAt: subject.createdAt,
    materials,
  };
}

async function loadAccessibleSubjects(user) {
  const classroomFilter = { status: 'active' };
  if (user.role === 'teacher') {
    classroomFilter.$or = [{ teacher: user._id }, { teachers: user._id }];
  } else {
    classroomFilter.students = user._id;
  }

  const classrooms = await Classroom.find(classroomFilter).select('_id');
  const subjects = await Subject.find({ classroom: { $in: classrooms.map(({ _id }) => _id) } })
    .sort({ name: 1, createdAt: -1 })
    .populate('classroom', 'name status')
    .populate('createdBy', 'firstName lastName');

  if (!subjects.length) return [];

  const materials = await SubjectMaterial.find({ subject: { $in: subjects.map(({ _id }) => _id) } })
    .select('-data')
    .sort({ availableAt: 1, createdAt: -1 })
    .populate('uploader', 'firstName lastName');
  const bySubject = new Map();
  for (const material of materials) {
    const key = String(material.subject);
    const items = bySubject.get(key) ?? [];
    items.push(subjectMaterialResult(material, true));
    bySubject.set(key, items);
  }
  return subjects.map((subject) => subjectResult(subject, bySubject.get(String(subject._id)) ?? []));
}

async function loadSubject(id, user) {
  const subject = await Subject.findById(id)
    .populate('classroom', 'name status teacher teachers students')
    .populate('createdBy', 'firstName lastName');
  if (!subject?.classroom || subject.classroom.status !== 'active') {
    throw new AppError(404, 'Subject not found');
  }

  if (user.role === 'teacher' && !teacherAssignedTo(subject.classroom, user)) {
    throw new AppError(404, 'Subject not found');
  }
  if (user.role === 'student' && !isClassMember(subject.classroom, user)) {
    throw new AppError(404, 'Subject not found');
  }
  return subject;
}

export async function listSubjects(user) {
  return { items: await loadAccessibleSubjects(user) };
}

export async function createSubject(data, { actor, ipAddress }) {
  const classroom = await Classroom.findById(data.classroomId);
  if (!classroom || classroom.status !== 'active') {
    throw new AppError(404, 'Active classroom not found');
  }
  if (!teacherAssignedTo(classroom, actor)) {
    throw new AppError(403, 'You are not assigned to this classroom');
  }

  const subject = await Subject.create({
    name: data.name,
    description: data.description,
    classroom: classroom._id,
    createdBy: actor._id,
  });
  await logActivity({
    actorId: actor._id,
    action: 'subject.created',
    entityType: 'Subject',
    entityId: subject._id,
    description: `${actor.fullName} created subject "${subject.name}" for "${classroom.name}"`,
    ipAddress,
  });
  return getSubject(subject._id, actor);
}

export async function getSubject(id, user) {
  const subject = await loadSubject(id, user);
  const materials = await SubjectMaterial.find({ subject: subject._id })
    .select('-data')
    .sort({ availableAt: 1, createdAt: -1 })
    .populate('uploader', 'firstName lastName');
  return subjectResult(subject, materials.map((material) => subjectMaterialResult(material, true)));
}

export async function createSubjectMaterial(id, { name, data, availableAt }, user) {
  const subject = await loadSubject(id, user);
  if (user.role !== 'teacher') {
    throw new AppError(403, 'Only assigned teachers can upload subject materials');
  }

  const material = await SubjectMaterial.create({
    subject: subject._id,
    uploader: user._id,
    name,
    size: data.length,
    data,
    availableAt: availableAt ?? new Date(),
  });
  await material.populate('uploader', 'firstName lastName');
  return subjectMaterialResult(material, true);
}

export async function getSubjectMaterial(id, materialId, user) {
  const subject = await loadSubject(id, user);
  const material = await SubjectMaterial.findOne({ _id: materialId, subject: subject._id })
    .select('+data')
    .populate('uploader', 'firstName lastName');
  if (!material) throw new AppError(404, 'Material not found');
  if (user.role === 'student' && material.availableAt > new Date()) {
    throw new AppError(403, 'This material is scheduled and is not available for download yet');
  }
  return { ...subjectMaterialResult(material, true), data: material.data };
}
