import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Banknote, ChevronDown, Pencil, Plus, School } from 'lucide-react';
import toast from 'react-hot-toast';
import Alert, { ErrorState } from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button, { IconButton } from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import EmptyState, { Skeleton } from '../../components/common/EmptyState.jsx';
import { FilterSelect, ListToolbar, matchesSearch, SearchInput } from '../../components/common/ListFilters.jsx';
import Modal, { ModalActions } from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import PeoplePicker from '../../components/common/PeoplePicker.jsx';
import TextField, { SelectField } from '../../components/common/TextField.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { userService } from '../../services/user.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatAmount } from '../../utils/format.js';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active classrooms' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All statuses' },
];
const CLASSROOM_TYPE_OPTIONS = [
  { value: 'standard', label: 'Standard Classroom' },
  { value: 'open', label: 'Open Classroom' },
];
const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  ...CLASSROOM_TYPE_OPTIONS,
];
const NEW_CLASSROOM = { name: '', teacherIds: [], studentIds: [], type: 'standard', sessionRate: '' };

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
        userService.listAll({ role: 'teacher', status: 'active' }),
        userService.listAll({ role: 'student', status: 'active' }),
      ]);
      setClassrooms(classItems);
      setTeachers(teacherList);
      setStudents(studentList);
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
        openAccess: values.type === 'open',
        // Empty means "whatever the school rate is"; a number is this class's rate.
        sessionRate: values.sessionRate === '' ? null : Number(values.sessionRate),
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
    type: classroom.openAccess ? 'open' : 'standard',
    sessionRate: classroom.sessionRate ?? '',
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
  const clearFilters = () => {
    setQuery('');
    setType('');
    setStatus('active');
  };

  return (
    <>
      <PageHeader
        title="Classrooms"
        description="Create classrooms, assign one or more teachers, and manage each student roster."
        actions={
          <Button onClick={() => setForm(NEW_CLASSROOM)}>
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
          <FilterSelect id="classroom-status" label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} className="sm:w-52" />
          <FilterSelect id="classroom-type" label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} className="sm:w-40" />
        </div>
      </ListToolbar>

      {loading ? (
        <div className="space-y-2" role="status" aria-label="Loading classrooms">
          {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-14 rounded-xl" />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : shown.length === 0 ? (
        classrooms.length === 0 && !hasFilters ? (
          <EmptyState
            icon={School}
            title="No classrooms yet"
            message="Create a classroom to assign teachers, enrol students and schedule sessions."
            action={(
              <Button onClick={() => setForm(NEW_CLASSROOM)}>
                <Plus className="size-4" aria-hidden="true" />
                Add Classroom
              </Button>
            )}
          />
        ) : (
          <EmptyState
            icon={School}
            title="No classrooms match your filters"
            message="Try another search, status or type."
            action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
          />
        )
      ) : (
        <Card>
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_9rem_5rem] gap-4 border-b border-ink-200 px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-500 md:grid">
            <span>Classroom</span>
            <span>Teachers</span>
            <span>Students</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-ink-200">
            {shown.map((classroom) => {
              const archived = isArchived(classroom);
              const roster = classroom.students ?? [];
              const expanded = expandedId === classroom.id;
              const rosterId = `roster-${classroom.id}`;
              return (
                <li key={classroom.id}>
                  <div className="relative grid gap-1 px-5 py-3 pr-24 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_9rem_5rem] md:items-center md:gap-4 md:pr-5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={`truncate font-medium ${archived ? 'text-ink-500' : 'text-ink-900'}`}>{classroom.name}</span>
                      {classroom.openAccess && <Badge tone="warning">Open</Badge>}
                      {archived && <Badge>Archived</Badge>}
                      {classroom.sessionRate != null && (
                        <span
                          className="inline-flex items-center gap-1 text-xs tabular-nums text-ink-500"
                          title="What this class pays a teacher for the whole session"
                        >
                          <Banknote className="size-3" aria-hidden="true" /> {formatAmount(classroom.sessionRate)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-ink-600" title={teachersOf(classroom).map(personName).join(', ')}>
                      <span className="text-ink-500 md:hidden">Teachers: </span>
                      {teachersOf(classroom).map(personName).join(', ') || 'Unassigned'}
                    </p>
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : classroom.id)}
                        disabled={roster.length === 0}
                        aria-expanded={roster.length > 0 ? expanded : undefined}
                        aria-controls={expanded ? rosterId : undefined}
                        title={roster.length > 0 ? (expanded ? 'Hide students' : 'Show students') : undefined}
                        className="-mx-2 inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm tabular-nums text-ink-700 hover:bg-ink-100 hover:text-ink-900 disabled:cursor-default disabled:text-ink-500 disabled:hover:bg-transparent"
                      >
                        {roster.length} {roster.length === 1 ? 'student' : 'students'}
                        {roster.length > 0 && (
                          <ChevronDown className={`size-4 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {/* Pinned to the row's top-right corner on small screens, where the row stacks. */}
                    <div className="absolute right-4 top-2.5 flex gap-0.5 md:static md:justify-end">
                      {archived ? (
                        <span className="py-1.5 text-xs text-ink-500">Read only</span>
                      ) : (
                        <>
                          <IconButton label={`Edit ${classroom.name}`} icon={Pencil} onClick={() => openEdit(classroom)} />
                          <IconButton label={`Archive ${classroom.name}`} icon={Archive} onClick={() => setArchiving(classroom)} />
                        </>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <ul id={rosterId} className="flex flex-wrap gap-1 px-5 pb-3" aria-label={`${classroom.name} students`}>
                      {roster.map((student) => (
                        <li key={student.id ?? student} className="rounded-md bg-ink-100 px-2 py-0.5 text-xs text-ink-700">
                          {personName(student)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
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
  const [type, setType] = useState(initial.type ?? (initial.openAccess ? 'open' : 'standard'));
  // Empty means "whatever the school rate is"; a number is this class's rate.
  const [sessionRate, setSessionRate] = useState(initial.sessionRate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const formRef = useRef(null);

  const submit = async (event) => {
    event.preventDefault();
    const problems = {};
    if (!name.trim()) problems.name = 'Enter a classroom name.';
    if (teacherIds.length === 0) problems.teachers = 'Assign at least one teacher.';
    if (sessionRate !== '' && (!Number.isFinite(Number(sessionRate)) || Number(sessionRate) < 0)) {
      problems.sessionRate = 'Enter a rate of zero or more, or leave it empty.';
    }
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) {
      // Move focus to the first field that needs attention.
      const target = problems.name
        ? formRef.current?.querySelector('#classroom-name')
        : problems.sessionRate
          ? formRef.current?.querySelector('#classroom-rate')
          : formRef.current?.querySelector('[data-picker="teachers"] input');
      target?.focus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name, teacherIds, studentIds, type, sessionRate });
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save classroom.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form ref={formRef} className="space-y-4" onSubmit={submit} noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <TextField
          id="classroom-name"
          label="Classroom name"
          value={name}
          maxLength={80}
          count={name.length}
          placeholder="For example, IELTS 6001"
          autoComplete="off"
          required
          error={fieldErrors.name}
          onChange={(event) => {
            setName(event.target.value);
            setFieldErrors((current) => ({ ...current, name: undefined }));
          }}
        />
        <SelectField
          id="classroom-type"
          label="Classroom type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          options={CLASSROOM_TYPE_OPTIONS}
          className="sm:mt-6.5"
        />
      </div>
      {type === 'open' && (
        <p className="-mt-2 text-xs text-amber-800">Any signed-in active account can join this classroom’s session rooms. Open rooms support up to 20 participants.</p>
      )}
      <div className="max-w-xs">
        <TextField
          id="classroom-rate"
          label="Rate per class (optional)"
          type="number"
          min="0"
          step="0.01"
          value={sessionRate}
          placeholder="School rate"
          title="What a teacher is paid for teaching this class for the whole session. Leave empty to use the school rate."
          error={fieldErrors.sessionRate}
          onChange={(event) => {
            setSessionRate(event.target.value);
            setFieldErrors((current) => ({ ...current, sessionRate: undefined }));
          }}
        />
        <p className="mt-1.5 text-xs text-ink-500">
          Paid for the whole session; a shorter visit earns it pro rata. A teacher’s individual rate is used instead when they have one.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PeoplePicker
          label="Teachers"
          people={teachers}
          selectedIds={teacherIds}
          onChange={(ids) => {
            setTeacherIds(ids);
            setFieldErrors((current) => ({ ...current, teachers: undefined }));
          }}
          name="teachers"
          required
          error={fieldErrors.teachers}
          emptyMessage="No active teacher accounts."
          hint="Every assigned teacher can manage this classroom’s sessions."
        />
        <PeoplePicker
          label="Students"
          people={students}
          selectedIds={studentIds}
          onChange={setStudentIds}
          emptyMessage="No active student accounts."
          hint="Optional. You can add students later."
        />
      </div>
      <ModalActions>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving}>{initial.id ? 'Save changes' : 'Create classroom'}</Button>
      </ModalActions>
    </form>
  );
}
