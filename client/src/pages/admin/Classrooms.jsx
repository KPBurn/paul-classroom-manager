import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ChevronDown, Pencil, Plus, School } from 'lucide-react';
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
import TextField from '../../components/common/TextField.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { userService } from '../../services/user.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { daysOutsideAvailability, formatSchedule, formatTimeRange, sortSlots, WEEKDAYS } from '../../utils/schedule.js';

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
const NEW_CLASSROOM = { name: '', subject: '', schedule: null, teacherIds: [], studentIds: [], openAccess: false };

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

  // The people who can be assigned do not depend on the status filter, so they are loaded once.
  const loadPeople = useCallback(async () => {
    const [teacherList, studentList] = await Promise.all([
      userService.listAll({ role: 'teacher', status: 'active' }),
      userService.listAll({ role: 'student', status: 'active' }),
    ]);
    setTeachers(teacherList);
    setStudents(studentList);
  }, []);
  const peopleLoaded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [classItems] = await Promise.all([
        classroomService.list({ includeArchived }),
        peopleLoaded.current ? null : loadPeople(),
      ]);
      peopleLoaded.current = true;
      setClassrooms(classItems);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load classrooms.'));
    } finally {
      setLoading(false);
    }
  }, [includeArchived, loadPeople]);

  useEffect(() => {
    load();
  }, [load]);

  // Puts a saved classroom into the list where the server would list it: active first, then by name.
  const showSaved = (saved) => setClassrooms((current) => [...current.filter((classroom) => classroom.id !== saved.id), saved]
    .filter((classroom) => includeArchived || !isArchived(classroom))
    .sort((a, b) => Number(isArchived(a)) - Number(isArchived(b)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));

  const save = async (values) => {
    try {
      const changes = {
        name: values.name.trim(),
        subject: values.subject.trim(),
        schedule: values.schedule,
        teacherIds: values.teacherIds,
        studentIds: values.studentIds,
        openAccess: values.openAccess,
      };
      showSaved(form.id ? await classroomService.update(form.id, changes) : await classroomService.create(changes));
      toast.success(`Classroom ${form.id ? 'updated' : 'created'}.`);
      setForm(null);
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, 'Unable to save classroom.'));
    }
  };

  const archive = async () => {
    try {
      showSaved(await classroomService.archive(archiving.id));
      toast.success(`${archiving.name} was archived.`);
      setArchiving(null);
    } catch (archiveError) {
      toast.error(getErrorMessage(archiveError, 'Unable to archive classroom.'));
      setArchiving(null);
    }
  };

  const openEdit = (classroom) => setForm({
    id: classroom.id,
    name: classroom.name,
    subject: classroom.subject ?? '',
    schedule: classroom.schedule ?? null,
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
      classroom.subject,
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
        description="Create a class for each subject, assign its teachers, choose its weekly schedule from the teacher’s availability, and manage each student roster."
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
          placeholder="Search by classroom, subject, teacher or student"
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
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={`truncate font-medium ${archived ? 'text-ink-500' : 'text-ink-900'}`}>{classroom.name}</span>
                        {classroom.openAccess && <Badge tone="warning">Open</Badge>}
                        {archived && <Badge>Archived</Badge>}
                      </div>
                      <p className="truncate text-xs text-ink-500">
                        {[classroom.subject, formatSchedule(classroom.schedule, 'No schedule yet')].filter(Boolean).join(' · ')}
                      </p>
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
          subjects={[...new Set(classrooms.map((classroom) => classroom.subject).filter(Boolean))].sort()}
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

function ClassroomForm({ initial, teachers, students, subjects, onCancel, onSave }) {
  const [name, setName] = useState(initial.name);
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [weekdays, setWeekdays] = useState(initial.schedule?.weekdays ?? []);
  const [startTime, setStartTime] = useState(initial.schedule?.startTime ?? '');
  const [endTime, setEndTime] = useState(initial.schedule?.endTime ?? '');
  const [teacherIds, setTeacherIds] = useState(initial.teacherIds || (initial.teacherId ? [initial.teacherId] : []));
  const [studentIds, setStudentIds] = useState(initial.studentIds || []);
  const [openAccess, setOpenAccess] = useState(initial.openAccess ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const formRef = useRef(null);

  // The class is scheduled inside the hours of its first teacher, as the server checks.
  const leadTeacher = teachers.find((teacher) => teacher.id === teacherIds[0]);
  const availability = sortSlots(leadTeacher?.availability ?? []);
  const availableDays = new Set(availability.map((slot) => slot.weekday));
  const schedule = weekdays.length ? { weekdays: [...weekdays].sort((a, b) => a - b), startTime, endTime } : null;

  const scheduleProblem = () => {
    if (!schedule) return undefined;
    if (!startTime || !endTime || endTime <= startTime) return 'Enter a start time and a later end time.';
    const outside = daysOutsideAvailability(schedule, availability);
    return outside.length
      ? `${leadTeacher ? personName(leadTeacher) : 'The teacher'} is not available on ${outside.map((day) => WEEKDAYS[day].label).join(', ')} at that time.`
      : undefined;
  };
  const clearScheduleError = () => setFieldErrors((current) => ({ ...current, schedule: undefined }));
  const toggleDay = (day) => {
    setWeekdays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]));
    clearScheduleError();
  };

  const submit = async (event) => {
    event.preventDefault();
    const problems = {};
    if (!name.trim()) problems.name = 'Enter a classroom name.';
    if (teacherIds.length === 0) problems.teachers = 'Assign at least one teacher.';
    const scheduleError = scheduleProblem();
    if (scheduleError) problems.schedule = scheduleError;
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) {
      // Move focus to the first field that needs attention.
      const target = problems.name
        ? formRef.current?.querySelector('#classroom-name')
        : problems.teachers
          ? formRef.current?.querySelector('[data-picker="teachers"] input')
          : formRef.current?.querySelector('#classroom-start-time');
      target?.focus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name, subject, schedule, teacherIds, studentIds, openAccess });
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
        <label
          className={`flex h-10.5 items-center gap-2.5 rounded-lg border px-3 text-sm font-medium transition sm:mt-6.5 ${openAccess ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400'}`}
          title="Any signed-in active account can join its session rooms (up to 20 participants)."
        >
          <input
            type="checkbox"
            checked={openAccess}
            onChange={(event) => setOpenAccess(event.target.checked)}
            className="size-4"
          />
          Open classroom
        </label>
      </div>
      {openAccess && (
        <p className="-mt-2 text-xs text-amber-800">Any signed-in active account can join this classroom’s session rooms. Open rooms support up to 20 participants.</p>
      )}
      <div>
        <TextField
          id="classroom-subject"
          label="Subject"
          value={subject}
          maxLength={80}
          placeholder="For example, English"
          autoComplete="off"
          list="classroom-subjects"
          onChange={(event) => setSubject(event.target.value)}
        />
        <datalist id="classroom-subjects">
          {subjects.map((item) => <option key={item} value={item} />)}
        </datalist>
        <p className="mt-1 text-xs text-ink-500">Students applying for a class see the classes grouped by subject.</p>
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
          hint="Every assigned teacher can manage this classroom’s sessions. The schedule follows the first teacher’s availability."
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
      <fieldset aria-describedby={fieldErrors.schedule ? 'classroom-schedule-error' : undefined}>
        <legend className="mb-1.5 text-sm font-medium text-ink-700">Weekly schedule</legend>
        {!leadTeacher ? (
          <p className="rounded-lg border border-dashed border-ink-300 px-3 py-3 text-sm text-ink-500">
            Assign a teacher first. The schedule is chosen from that teacher’s availability.
          </p>
        ) : availability.length === 0 ? (
          <Alert tone="warning">
            {personName(leadTeacher)} has not set any teaching availability yet, so this class cannot be given a schedule.
            Set it from the Teachers page, or ask the teacher to add it in their profile. You can save the class now and
            add the schedule later.
          </Alert>
        ) : (
          <div className="space-y-3 rounded-lg border border-ink-300 p-3">
            <p className="text-xs text-ink-600">
              <span className="font-medium text-ink-900">{personName(leadTeacher)} is available: </span>
              {availability.map((slot) => `${WEEKDAYS[slot.weekday].short} ${formatTimeRange(slot)}`).join('; ')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const selected = weekdays.includes(day.value);
                const unavailable = !availableDays.has(day.value) && !selected;
                return (
                  <label
                    key={day.value}
                    title={unavailable ? `${personName(leadTeacher)} is not available on ${day.label}` : undefined}
                    className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition ${selected ? 'border-ink-900 bg-ink-50 font-medium text-ink-900' : unavailable ? 'border-ink-200 text-ink-400' : 'cursor-pointer border-ink-300 text-ink-700 hover:border-ink-400'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={unavailable}
                      onChange={() => toggleDay(day.value)}
                      className="size-4"
                    />
                    {day.short}
                  </label>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id="classroom-start-time"
                label="Start time"
                type="time"
                value={startTime}
                disabled={weekdays.length === 0}
                onChange={(event) => {
                  setStartTime(event.target.value);
                  clearScheduleError();
                }}
              />
              <TextField
                id="classroom-end-time"
                label="End time"
                type="time"
                value={endTime}
                disabled={weekdays.length === 0}
                onChange={(event) => {
                  setEndTime(event.target.value);
                  clearScheduleError();
                }}
              />
            </div>
            <p className="text-xs text-ink-500">
              {weekdays.length === 0
                ? 'Choose the days to set a schedule, or leave them empty to announce it later.'
                : 'This is the class time students see when they apply. Book the dated sessions from Schedules.'}
            </p>
          </div>
        )}
        {fieldErrors.schedule && <p id="classroom-schedule-error" className="mt-1.5 text-sm text-red-700">{fieldErrors.schedule}</p>}
      </fieldset>
      <ModalActions>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving}>{initial.id ? 'Save changes' : 'Create classroom'}</Button>
      </ModalActions>
    </form>
  );
}
