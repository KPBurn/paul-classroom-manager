import { Fragment, useCallback, useEffect, useState } from 'react';
import { Archive, ChevronDown, Pencil, Plus, School } from 'lucide-react';
import toast from 'react-hot-toast';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { FilterSelect, ListToolbar, matchesSearch, SearchInput } from '../../components/common/ListFilters.jsx';
import Modal from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import PeoplePicker from '../../components/common/PeoplePicker.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { userService } from '../../services/user.service.js';
import { getErrorMessage } from '../../utils/errors.js';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active classrooms' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All statuses' },
];
const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'standard', label: 'Standard' },
  { value: 'open', label: 'Open classrooms' },
];
const smallButton = '!px-2.5 !py-1.5 text-xs';

const personName = (person) => person.name ?? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
const teachersOf = (classroom) => (classroom.teachers?.length
  ? classroom.teachers
  : classroom.teacher ? [classroom.teacher] : []);
const isArchived = (classroom) => classroom.archived || classroom.status === 'archived';

export default function Classrooms() {
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const includeArchived = status !== 'active';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [classItems, teacherList, studentList] = await Promise.all([
        classroomService.list({ includeArchived }),
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
  }, [includeArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (values) => {
    try {
      const changes = {
        name: values.name.trim(),
        teacherIds: values.teacherIds,
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

  const openEdit = (classroom) => setForm({
    id: classroom.id,
    name: classroom.name,
    teacherIds: teachersOf(classroom).map((teacher) => teacher.id ?? teacher),
    studentIds: classroom.students?.map((student) => student.id ?? student) ?? [],
    openAccess: classroom.openAccess ?? false,
  });

  const shown = classrooms.filter((classroom) => (
    (status !== 'archived' || isArchived(classroom))
    && (!type || (type === 'open') === Boolean(classroom.openAccess))
    && matchesSearch(
      query,
      classroom.name,
      teachersOf(classroom).map(personName),
      (classroom.students ?? []).map(personName),
    )
  ));
  const hasFilters = Boolean(query || type || status !== 'active');

  return (
    <>
      <PageHeader
        title="Classrooms"
        description="Create classrooms, assign one or more teachers, and manage each student roster."
        actions={
          <Button onClick={() => setForm({ name: '', teacherIds: [], studentIds: [] })}>
            <Plus className="size-4" aria-hidden="true" />
            Add Classroom
          </Button>
        }
      />

      <ListToolbar count={loading ? undefined : shown.length} noun="classroom">
        <SearchInput
          id="classroom-search"
          label="Search classrooms"
          value={query}
          onChange={setQuery}
          placeholder="Search by classroom, teacher or student"
          className="sm:w-80"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <FilterSelect id="classroom-status" label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} className="sm:w-44" />
          <FilterSelect id="classroom-type" label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} className="sm:w-40" />
        </div>
      </ListToolbar>

      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <School className="mx-auto size-7 text-slate-400" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900">
            {classrooms.length === 0 ? 'No classrooms yet' : 'No classrooms match your filters'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {classrooms.length === 0 ? 'Create one to organize students and sessions.' : 'Try another search or filter.'}
          </p>
          {hasFilters && classrooms.length > 0 && (
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => {
                setQuery('');
                setType('');
                setStatus('active');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_9rem_10rem] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 md:grid">
            <span>Classroom</span>
            <span>Teachers</span>
            <span>Students</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {shown.map((classroom) => {
              const archived = isArchived(classroom);
              const roster = classroom.students ?? [];
              const expanded = expandedId === classroom.id;
              return (
                <li key={classroom.id} className={archived ? 'bg-slate-50/60' : ''}>
                  <div className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_9rem_10rem] md:items-center md:gap-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-slate-900">{classroom.name}</span>
                      {classroom.openAccess && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Open</span>
                      )}
                      {archived && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">Archived</span>
                      )}
                    </div>
                    <p className="truncate text-sm text-slate-600" title={teachersOf(classroom).map(personName).join(', ')}>
                      <span className="text-slate-400 md:hidden">Teachers: </span>
                      {teachersOf(classroom).map(personName).join(', ') || 'Unassigned'}
                    </p>
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : classroom.id)}
                        disabled={roster.length === 0}
                        aria-expanded={expanded}
                        className="inline-flex items-center gap-1 rounded-md py-0.5 text-sm text-slate-600 hover:text-indigo-700 disabled:cursor-default disabled:hover:text-slate-600"
                      >
                        {roster.length} {roster.length === 1 ? 'student' : 'students'}
                        {roster.length > 0 && (
                          <ChevronDown className={`size-4 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <div className="flex gap-2 md:justify-end">
                      {!archived && (
                        <Fragment>
                          <Button variant="secondary" className={smallButton} onClick={() => openEdit(classroom)}>
                            <Pencil className="size-3.5" aria-hidden="true" /> Edit
                          </Button>
                          <Button variant="secondary" className={smallButton} onClick={() => setArchiving(classroom)}>
                            <Archive className="size-3.5" aria-hidden="true" /> Archive
                          </Button>
                        </Fragment>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <ul className="flex flex-wrap gap-1.5 px-4 pb-3" aria-label={`${classroom.name} students`}>
                      {roster.map((student) => (
                        <li key={student.id ?? student} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                          {personName(student)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit Classroom' : 'Add Classroom'}
        size="max-w-3xl"
      >
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
  const [teacherIds, setTeacherIds] = useState(initial.teacherIds || (initial.teacherId ? [initial.teacherId] : []));
  const [studentIds, setStudentIds] = useState(initial.studentIds || []);
  const [openAccess, setOpenAccess] = useState(initial.openAccess ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim() || teacherIds.length === 0) {
      setError('Enter a classroom name and assign at least one teacher.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name, teacherIds, studentIds, openAccess });
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save classroom.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block text-sm font-medium text-slate-700">
          Classroom name
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            required
          />
        </label>
        <label
          className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-950"
          title="Any signed-in active account can join its session rooms (up to 20 participants)."
        >
          <input
            type="checkbox"
            checked={openAccess}
            onChange={(event) => setOpenAccess(event.target.checked)}
            className="size-4 rounded border-amber-400 text-indigo-600 focus:ring-indigo-500"
          />
          Open classroom
        </label>
      </div>
      {openAccess && (
        <p className="-mt-2 text-xs text-amber-800">Any signed-in active account can join this classroom’s session rooms. Open rooms support up to 20 participants.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <PeoplePicker
          label="Teachers"
          people={teachers}
          selectedIds={teacherIds}
          onChange={setTeacherIds}
          emptyMessage="No active teacher accounts."
          hint="Every assigned teacher can manage this classroom’s sessions."
        />
        <PeoplePicker
          label="Students"
          people={students}
          selectedIds={studentIds}
          onChange={setStudentIds}
          emptyMessage="No active student accounts."
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving}>{initial.id ? 'Save changes' : 'Create classroom'}</Button>
      </div>
    </form>
  );
}
