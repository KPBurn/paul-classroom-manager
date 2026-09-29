import { useCallback, useEffect, useState } from 'react';
import { Archive, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import Modal from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { SelectField } from '../../components/common/TextField.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { userService } from '../../services/user.service.js';
import { getErrorMessage } from '../../utils/errors.js';

export default function Classrooms() {
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [classItems, teacherList, studentList] = await Promise.all([
        classroomService.list({ includeArchived: showArchived }),
        userService.list({ limit: 100, role: 'teacher', status: 'active' }),
        userService.list({ limit: 100, role: 'student', status: 'active' }),
      ]);
      setClassrooms(classItems);
      setTeachers(teacherList.items);
      setStudents(studentList.items);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load classrooms.'));
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (values) => {
    try {
      const changes = {
        name: values.name.trim(),
        teacherId: values.teacherId,
        studentIds: values.studentIds,
        openAccess: values.openAccess,
      };
      if (form.id) await classroomService.update(form.id, changes);
      else await classroomService.create(changes);
      toast.success(`Classroom ${form.id ? 'updated' : 'created'}.`);
      setForm(null);
      await load();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, 'Unable to save classroom.'));
    }
  };

  const archive = async () => {
    try {
      await classroomService.archive(archiving.id);
      toast.success(`${archiving.name} was archived.`);
      setArchiving(null);
      await load();
    } catch (archiveError) {
      toast.error(getErrorMessage(archiveError, 'Unable to archive classroom.'));
      setArchiving(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Classrooms"
        description="Create classes, assign one teacher, and manage each student roster."
        actions={
          <Button onClick={() => setForm({ name: '', teacherId: '', studentIds: [] })}>
            <Plus className="size-4" aria-hidden="true" />
            Add Classroom
          </Button>
        }
      />
      <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
        Show archived classrooms
      </label>

      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-500">
          No classrooms yet. Create one to organize students and sessions.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {classrooms.map((classroom) => (
              <li key={classroom.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {classroom.name}
                    {classroom.openAccess && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">Open</span>
                    )}
                    {(classroom.archived || classroom.isArchived || classroom.status === 'archived') && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">Archived</span>
                    )}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Teacher: {(classroom.teacher?.name ?? `${classroom.teacher?.firstName ?? ''} ${classroom.teacher?.lastName ?? ''}`.trim()) || 'Unassigned'}
                    <span className="mx-2 text-slate-300">·</span>
                    {classroom.students?.length ?? 0} students
                  </p>
                  {classroom.students?.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">{classroom.students.map((student) => student.name ?? `${student.firstName} ${student.lastName}`).join(', ')}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={classroom.archived || classroom.isArchived || classroom.status === 'archived'} onClick={() => setForm({
                    id: classroom.id,
                    name: classroom.name,
                    teacherId: classroom.teacher?.id ?? classroom.teacher,
                    studentIds: classroom.students?.map((student) => student.id ?? student) ?? [],
                    openAccess: classroom.openAccess ?? false,
                  })}>Edit</Button>
                  <Button variant="secondary" disabled={classroom.archived || classroom.isArchived || classroom.status === 'archived'} onClick={() => setArchiving(classroom)}>
                    <Archive className="size-4" aria-hidden="true" />
                    Archive
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Edit Classroom' : 'Add Classroom'}>
        {form && <ClassroomForm
          key={form.id ?? 'new'}
          initial={form}
          teachers={teachers}
          students={students}
          onCancel={() => setForm(null)}
          onSave={save}
        />}
      </Modal>
      <ConfirmDialog
        open={Boolean(archiving)}
        title="Archive classroom?"
        message={`${archiving?.name} will be hidden from active schedules. Existing attendance history will be kept.`}
        confirmLabel="Archive"
        confirmVariant="danger"
        onConfirm={archive}
        onCancel={() => setArchiving(null)}
      />
    </>
  );
}

function ClassroomForm({ initial, teachers, students, onCancel, onSave }) {
  const [name, setName] = useState(initial.name);
  const [teacherId, setTeacherId] = useState(initial.teacherId || '');
  const [studentIds, setStudentIds] = useState(initial.studentIds || []);
  const [openAccess, setOpenAccess] = useState(initial.openAccess ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleStudent = (id) => {
    setStudentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim() || !teacherId) {
      setError('Enter a classroom name and assign a teacher.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name, teacherId, studentIds, openAccess });
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save classroom.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      {error && <Alert tone="error">{error}</Alert>}
      <label className="block text-sm font-medium text-slate-700">
        Classroom name
        <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
      </label>
      <SelectField
        id="classroom-teacher"
        label="Teacher"
        value={teacherId}
        onChange={(event) => setTeacherId(event.target.value)}
        options={[{ value: '', label: 'Select teacher' }, ...teachers.map((teacher) => ({ value: teacher.id, label: `${teacher.firstName} ${teacher.lastName}` }))]}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Students</legend>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
          {students.length === 0 ? <p className="text-sm text-slate-500">No active student accounts.</p> : students.map((student) => (
            <label key={student.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={studentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <span>{student.firstName} {student.lastName} <span className="text-slate-400">({student.email})</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <input
          type="checkbox"
          checked={openAccess}
          onChange={(event) => setOpenAccess(event.target.checked)}
          className="mt-0.5 size-4 rounded border-amber-400 text-indigo-600 focus:ring-indigo-500"
        />
        <span>
          <span className="block font-medium">Open classroom</span>
          <span className="mt-0.5 block text-amber-800">Any signed-in active account can join its session rooms. Open rooms support up to 20 participants.</span>
        </span>
      </label>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving}>{initial.id ? 'Save changes' : 'Create classroom'}</Button>
      </div>
    </form>
  );
}
