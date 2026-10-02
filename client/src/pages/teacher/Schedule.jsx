import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarX, Clock3, MessageSquareText, Pencil, Plus, Repeat, UsersRound, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import ActionMenu from '../../components/common/ActionMenu.jsx';
import Alert from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card, { SectionLabel } from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { FilterSelect, ListToolbar, matchesSearch, SearchInput } from '../../components/common/ListFilters.jsx';
import Modal, { ModalActions } from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import PeoplePicker from '../../components/common/PeoplePicker.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import { inputClass, labelClass, SelectField } from '../../components/common/TextField.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { sessionService } from '../../services/session.service.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useNow } from '../../hooks/useNow.js';
import { ROLES } from '../../utils/roles.js';
import { getErrorMessage } from '../../utils/errors.js';
import {
  formatTime,
  isJoinable,
  isSameLocalDay,
  PHASE_LABELS,
  PHASE_TONES,
  sessionPhase,
} from '../../utils/sessionTiming.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 40;
const WHEN_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All dates' },
];
const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** "Today", "Tomorrow", or a weekday and date for schedule group headings. */
function dayLabel(value, now) {
  if (isSameLocalDay(value, now)) return 'Today';
  if (isSameLocalDay(value, now + 24 * 60 * 60 * 1000)) return 'Tomorrow';
  if (isSameLocalDay(value, now - 24 * 60 * 60 * 1000)) return 'Yesterday';
  const date = new Date(value);
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date(now).getFullYear() && { year: 'numeric' }),
  });
}

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const dateTime = (value) => new Date(value).toLocaleString([], {
  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

function classroomTeacherIds(classroom) {
  if (!classroom) return [];
  const teachers = classroom.teachers?.length ? classroom.teachers : [classroom.teacher];
  return [...new Set(teachers.filter(Boolean).map((teacher) => (
    typeof teacher === 'string' ? teacher : teacher.id ?? teacher._id
  )))];
}

function classroomStudentIds(classroom) {
  return classroom?.students?.map((student) => (
    typeof student === 'string' ? student : student.id ?? student._id
  )) ?? [];
}

export default function TeacherSchedule() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;
  const [sessions, setSessions] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editSession, setEditSession] = useState(null);
  const [attendanceSession, setAttendanceSession] = useState(null);
  const [cancelSession, setCancelSession] = useState(null);
  const [cancelScope, setCancelScope] = useState('occurrence');
  const [busy, setBusy] = useState(false);
  const [attendanceSettingsId, setAttendanceSettingsId] = useState(null);
  const [query, setQuery] = useState('');
  const [when, setWhen] = useState('upcoming');
  const [classroomFilter, setClassroomFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const now = useNow();

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, when, classroomFilter, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [items, classes] = await Promise.all([sessionService.list(), classroomService.list()]);
      setSessions(items);
      setClassrooms(classes);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your schedule.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (scope = cancelScope) => {
    setBusy(true);
    try {
      await sessionService.cancel(cancelSession.id, scope);
      toast.success(scope === 'series' ? 'Schedule series cancelled.' : 'Session cancelled.');
      setCancelSession(null);
      await load();
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, 'Unable to cancel session.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleAttendanceCondition = async (session) => {
    setAttendanceSettingsId(session.id);
    try {
      await sessionService.update(session.id, {
        scope: 'occurrence',
        attendanceConditionEnabled: !session.attendanceConditionEnabled,
      });
      toast.success(
        session.attendanceConditionEnabled
          ? 'Attendance conditions turned off for this session.'
          : 'Attendance conditions turned on for this session.',
      );
      await load();
    } catch (toggleError) {
      toast.error(getErrorMessage(toggleError, 'Unable to update attendance conditions.'));
    } finally {
      setAttendanceSettingsId(null);
    }
  };

  const classroomOptions = [
    { value: '', label: 'All classrooms' },
    ...[...new Map(sessions.map((session) => [session.classroom?.id, session.classroom?.name])).entries()]
      .filter(([classroomId]) => classroomId)
      .sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))
      .map(([value, label]) => ({ value, label })),
  ];
  const filtered = sessions
    .map((session) => ({ ...session, phase: sessionPhase(session, now) }))
    .filter((session) => {
      const startsAt = new Date(session.startsAt).getTime();
      const endsAt = new Date(session.endsAt).getTime();
      const inRange = {
        upcoming: endsAt > now,
        today: isSameLocalDay(startsAt, now),
        week: endsAt > now && startsAt - now <= WEEK_MS,
        past: endsAt <= now,
        all: true,
      }[when];
      const statusMatches = !statusFilter
        || (statusFilter === 'cancelled') === (session.status === 'cancelled');
      return inRange
        && statusMatches
        && (!classroomFilter || session.classroom?.id === classroomFilter)
        && matchesSearch(
          query,
          session.title,
          session.classroom?.name,
          session.assignments?.teachers?.map((teacher) => teacher.name),
        );
    })
    .sort((a, b) => (when === 'past' ? -1 : 1) * (new Date(a.startsAt) - new Date(b.startsAt)));
  const visible = filtered.slice(0, visibleCount);
  const days = [];
  for (const session of visible) {
    const key = new Date(session.startsAt).toDateString();
    if (days.at(-1)?.key !== key) days.push({ key, date: session.startsAt, sessions: [] });
    days.at(-1).sessions.push(session);
  }
  const hasFilters = Boolean(query || classroomFilter || statusFilter || when !== 'upcoming');
  const clearFilters = () => {
    setQuery('');
    setClassroomFilter('');
    setStatusFilter('');
    setWhen('upcoming');
  };

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Schedules' : 'Schedule'}
        description={isAdmin
          ? 'Schedule classes for students and teachers across all classrooms.'
          : 'Create dated sessions for your classrooms and review attendance.'}
        actions={
          <Button onClick={() => setFormOpen(true)} disabled={!classrooms.length}>
            <Plus className="size-4" aria-hidden="true" />
            Create Schedule
          </Button>
        }
      />
      {!classrooms.length && !loading && (
        <div className="mb-4">
          <Alert>{isAdmin
            ? 'Create an active classroom before scheduling classes.'
            : 'Your administrator needs to assign you to a classroom before you can schedule a session.'}</Alert>
        </div>
      )}

      <ListToolbar count={loading ? undefined : filtered.length} noun="session">
        <SearchInput
          id="schedule-search"
          label="Search sessions"
          value={query}
          onChange={setQuery}
          placeholder="Search title, class or teacher"
          className="sm:w-72"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <FilterSelect id="schedule-when" label="Dates" value={when} onChange={setWhen} options={WHEN_OPTIONS} className="sm:w-36" />
          <FilterSelect id="schedule-status" label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} className="sm:w-36" />
          <FilterSelect id="schedule-classroom" label="Classroom" value={classroomFilter} onChange={setClassroomFilter} options={classroomOptions} className="col-span-2 sm:w-48" />
        </div>
      </ListToolbar>

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      {loading ? <PageLoader label="Loading schedule…" /> : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={sessions.length === 0 ? 'No sessions scheduled yet' : 'No sessions match your filters'}
          message={sessions.length === 0 ? 'Create a schedule to see it here.' : 'Try another search, date range or classroom.'}
          action={hasFilters && sessions.length > 0 && (
            <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
          )}
        />
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day.key} aria-label={dayLabel(day.date, now)}>
              <SectionLabel className="mb-2">{dayLabel(day.date, now)}</SectionLabel>
              <Card as="ul" className="divide-y divide-ink-200">
                {day.sessions.map((session) => {
                  const cancelled = session.status === 'cancelled';
                  const joinable = isJoinable(session.phase) || session.phase === 'closed';
                  const teacherNames = session.assignments?.teachers?.map((teacher) => teacher.name ?? 'Teacher').join(', ');
                  // Teachers write feedback for lessons they taught, once the lesson has started.
                  const canGiveFeedback = !isAdmin
                    && new Date(session.startsAt).getTime() <= now
                    && session.assignments?.teachers?.some((teacher) => teacher.id === user.id);
                  return (
                    <li
                      key={session.id}
                      className="grid gap-2 px-5 py-3 lg:grid-cols-[7.5rem_minmax(0,1fr)_auto] lg:items-center lg:gap-4"
                    >
                      <p className={`text-sm tabular-nums ${cancelled ? 'text-ink-400 line-through' : 'font-medium text-ink-900'}`}>
                        {formatTime(session.startsAt)}
                        <span className="font-normal text-ink-500"> – {formatTime(session.endsAt)}</span>
                      </p>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <p className={`truncate text-sm font-medium ${cancelled ? 'text-ink-500' : 'text-ink-900'}`}>{session.title}</p>
                          {session.phase !== 'upcoming' && (
                            <Badge tone={PHASE_TONES[session.phase]}>{PHASE_LABELS[session.phase]}</Badge>
                          )}
                          {session.seriesId && (
                            <span className="inline-flex items-center gap-1 text-xs text-ink-500" title="Part of a weekly series">
                              <Repeat className="size-3" aria-hidden="true" /> Weekly
                            </span>
                          )}
                          {session.attendanceConditionEnabled === false && !cancelled && (
                            <Badge title="Everyone who joins during class is marked Present">No late rule</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-500">
                          {session.classroom?.name ?? 'Classroom'}
                          {teacherNames && <> · {teacherNames}</>}
                          {session.assignments && <> · {session.assignments.students.length} students</>}
                        </p>
                      </div>
                      {!cancelled && (
                        <div className="-ml-3 flex flex-wrap items-center gap-1 lg:ml-0 lg:justify-end">
                          {joinable && (
                            <Button
                              size="sm"
                              variant={session.phase === 'live' ? 'primary' : 'secondary'}
                              className="ml-3 mr-1 lg:ml-0"
                              onClick={() => navigate(`/sessions/${session.id}/room`)}
                            >
                              <Video className="size-4" aria-hidden="true" /> Join
                            </Button>
                          )}
                          {canGiveFeedback && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/teacher/feedback?class=${session.classroom?.id}&lesson=${session.id}`)}
                            >
                              <MessageSquareText className="size-4" aria-hidden="true" /> Feedback
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setAttendanceSession(session)}>
                            <UsersRound className="size-4" aria-hidden="true" /> Attendance
                          </Button>
                          <ActionMenu
                            label={`More actions for ${session.title}`}
                            items={[
                              { label: 'Edit session', icon: Pencil, onClick: () => setEditSession(session) },
                              {
                                label: session.attendanceConditionEnabled === false ? 'Turn late rule on' : 'Turn late rule off',
                                icon: Clock3,
                                disabled: attendanceSettingsId === session.id,
                                onClick: () => toggleAttendanceCondition(session),
                              },
                              {
                                label: session.seriesId ? 'Cancel session or series' : 'Cancel session',
                                icon: CalendarX,
                                danger: true,
                                onClick: () => {
                                  setCancelScope('occurrence');
                                  setCancelSession(session);
                                },
                              },
                            ]}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </Card>
            </section>
          ))}
          {filtered.length > visible.length && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                Show more ({filtered.length - visible.length} left)
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Create Sessions" description="Attendance is recorded automatically when participants join the class room during the session." size="max-w-3xl">
        <SessionForm
          classrooms={classrooms}
          actor={user}
          onCancel={() => setFormOpen(false)}
          onSave={async (values) => {
            const created = await sessionService.create(values);
            toast.success(`${created.length} session${created.length === 1 ? '' : 's'} scheduled.`);
            setFormOpen(false);
            await load();
          }}
        />
      </Modal>

      <Modal
        open={Boolean(editSession)}
        onClose={() => setEditSession(null)}
        title="Edit Session"
        description={editSession?.seriesId ? 'Choose whether to update one occurrence or the entire recurring series.' : undefined}
      >
        {editSession && (
          <EditSessionForm
            key={editSession.id}
            session={editSession}
            seriesSessions={sessions.filter((item) => item.seriesId === editSession.seriesId)}
            onCancel={() => setEditSession(null)}
            onSave={async (changes) => {
              await sessionService.update(editSession.id, changes);
              toast.success('Session updated.');
              setEditSession(null);
              await load();
            }}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(attendanceSession)}
        onClose={() => setAttendanceSession(null)}
        title="Session Attendance"
        description={attendanceSession && `${attendanceSession.title} · ${dateTime(attendanceSession.startsAt)}`}
        size="max-w-2xl"
      >
        {attendanceSession && <AttendancePanel session={attendanceSession} />}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelSession && !cancelSession.seriesId)}
        title="Cancel session?"
        message={cancelSession?.seriesId
          ? 'Cancel this occurrence or the whole recurring series?'
          : 'Students will no longer be able to check in to this session.'}
        confirmLabel="Cancel session"
        confirmVariant="danger"
        isLoading={busy}
        onConfirm={() => cancel('occurrence')}
        onCancel={() => setCancelSession(null)}
      />
      <Modal open={Boolean(cancelSession?.seriesId)} onClose={() => setCancelSession(null)} title="Cancel recurring sessions">
        <p className="text-sm text-ink-600">Choose whether to cancel only this date or the entire series.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setCancelSession(null)} disabled={busy}>Keep session</Button>
          <Button variant="secondary" onClick={() => {
            cancel('occurrence');
          }} isLoading={busy}>This occurrence</Button>
          <Button variant="danger" onClick={() => {
            cancel('series');
          }} isLoading={busy}>Entire series</Button>
        </div>
      </Modal>
    </>
  );
}

function EditSessionForm({ session, seriesSessions, onCancel, onSave }) {
  const start = new Date(session.startsAt);
  const end = new Date(session.endsAt);
  const localDate = (value) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const localTime = (value) => {
    const date = new Date(value);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };
  const [title, setTitle] = useState(session.title);
  const [date, setDate] = useState(localDate(start));
  const [startTime, setStartTime] = useState(localTime(start));
  const [endTime, setEndTime] = useState(localTime(end));
  const [scope, setScope] = useState('occurrence');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim() || startTime >= endTime) {
      setError('Enter a title and an end time after the start.');
      return;
    }
    const startsAt = new Date(`${date}T${startTime}`);
    const endsAt = new Date(`${date}T${endTime}`);
    if (endsAt <= startsAt) {
      setError('Set a valid session time.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ scope, title: title.trim(), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to update session.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {session.seriesId && (
        <SelectField
          id="edit-session-scope"
          label="Apply changes to"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          options={[{ value: 'occurrence', label: 'This occurrence only' }, { value: 'series', label: 'Entire series' }]}
        />
      )}
      <label className={labelClass}>Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className={inputClass(false, 'mt-1.5 font-normal')} required />
      </label>
      <label className={labelClass}>Date
        <input type="date" value={date} disabled={scope === 'series'} onChange={(event) => setDate(event.target.value)} className={inputClass(false, 'mt-1.5 font-normal')} required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Starts
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputClass(false, 'mt-1.5 font-normal')} required />
        </label>
        <label className={labelClass}>Ends
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={inputClass(false, 'mt-1.5 font-normal')} required />
        </label>
      </div>
      {scope === 'series' && seriesSessions.length > 0 && (
        <p className="text-xs text-ink-500">Applies to {seriesSessions.length} occurrences in this series.</p>
      )}
      <ModalActions>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving}>Save changes</Button>
      </ModalActions>
    </form>
  );
}

function SessionForm({ classrooms, actor, onCancel, onSave }) {
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('single');
  const [date, setDate] = useState(localDate);
  const [startDate, setStartDate] = useState(localDate);
  const [endDate, setEndDate] = useState(localDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [weekdays, setWeekdays] = useState([today.getDay()]);
  const initialClassroom = classrooms[0];
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [teacherIds, setTeacherIds] = useState(classroomTeacherIds(initialClassroom));
  const [studentIds, setStudentIds] = useState(classroomStudentIds(initialClassroom));
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Only a failed load of teachers and students blocks submitting; a validation message must not.
  const [optionsFailed, setOptionsFailed] = useState(false);

  const toggleDay = (day) => setWeekdays((current) => current.includes(day)
    ? current.filter((value) => value !== day)
    : [...current, day].sort((a, b) => a - b));

  useEffect(() => {
    let cancelled = false;
    const selectedClassroom = classrooms.find((room) => room.id === classroomId);
    setError('');
    setOptionsFailed(false);
    setTeacherIds(classroomTeacherIds(selectedClassroom));
    setStudentIds(classroomStudentIds(selectedClassroom));
    setLoadingOptions(true);
    sessionService.assignmentOptions(classroomId)
      .then((options) => {
        if (!cancelled) {
          setTeachers(options.teachers);
          setStudents(options.students);
          const activeTeacherIds = new Set(options.teachers.map((teacher) => teacher.id));
          const activeStudentIds = new Set(options.students.map((student) => student.id));
          setTeacherIds((current) => current.filter((id) => activeTeacherIds.has(id)));
          setStudentIds((current) => current.filter((id) => activeStudentIds.has(id)));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'Unable to load active teachers and students.'));
          setOptionsFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classroomId, classrooms]);

  const submit = async (event) => {
    event.preventDefault();
    if (!classroomId || !title.trim() || !teacherIds.length || startTime >= endTime) {
      setError('Choose a classroom, assign at least one teacher, enter a session title, and set an end time after the start.');
      return;
    }
    let values;
    if (mode === 'single') {
      const startsAt = new Date(`${date}T${startTime}`);
      const endsAt = new Date(`${date}T${endTime}`);
      if (Number.isNaN(startsAt.getTime()) || endsAt <= startsAt || startsAt <= new Date()) {
        setError('Choose a future date and valid session times.');
        return;
      }
      values = {
        classroomId,
        teacherIds,
        studentIds,
        title: title.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };
    } else {
      if (startDate > endDate || !weekdays.length) {
        setError('Choose a valid date range and at least one weekday.');
        return;
      }
      values = {
        classroomId, teacherIds, studentIds, title: title.trim(), startDate, endDate, startTime, endTime, weekdays,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }
    setSaving(true);
    setError('');
    try {
      await onSave(values);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to create sessions.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="session-classroom" label="Classroom" value={classroomId} onChange={(event) => setClassroomId(event.target.value)} options={classrooms.map((room) => ({ value: room.id, label: room.name }))} />
        <label className={labelClass}>Session title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="e.g. Math – Fractions" className={inputClass(false, 'mt-1.5 font-normal')} required />
        </label>
      </div>
      <fieldset disabled={loadingOptions} className="disabled:opacity-60">
        <legend className="sr-only">Classroom assignments</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <PeoplePicker
            label="Teachers"
            people={teachers}
            selectedIds={teacherIds}
            onChange={setTeacherIds}
            lockedIds={actor.role === ROLES.TEACHER ? [actor.id] : []}
            emptyMessage={loadingOptions ? 'Loading…' : 'No active teachers are available.'}
          />
          <PeoplePicker
            label="Students"
            people={students}
            selectedIds={studentIds}
            onChange={setStudentIds}
            emptyMessage={loadingOptions ? 'Loading…' : 'No active students are available.'}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-500">Saving this schedule updates the classroom’s assigned teachers and student roster.</p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField id="session-type" label="Schedule type" value={mode} onChange={(event) => setMode(event.target.value)} options={[{ value: 'single', label: 'One-time session' }, { value: 'recurring', label: 'Weekly sessions' }]} />
        <label className={labelClass}>Starts
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputClass(false, 'mt-1.5 font-normal')} required />
        </label>
        <label className={labelClass}>Ends
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={inputClass(false, 'mt-1.5 font-normal')} required />
        </label>
      </div>
      {mode === 'single' ? (
        <label className={`${labelClass} sm:w-1/3 sm:pr-3`}>Date
          <input type="date" min={localDate} value={date} onChange={(event) => setDate(event.target.value)} className={inputClass(false, 'mt-1.5 font-normal')} required />
        </label>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={labelClass}>First date
            <input type="date" min={localDate} value={startDate} onChange={(event) => setStartDate(event.target.value)} className={inputClass(false, 'mt-1.5 font-normal')} required />
          </label>
          <label className={labelClass}>Last date
            <input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass(false, 'mt-1.5 font-normal')} required />
          </label>
          <fieldset className="sm:col-span-3">
            <legend className="mb-1.5 text-sm font-medium text-ink-700">Repeat on</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => (
                <label
                  key={day.value}
                  className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition ${weekdays.includes(day.value) ? 'border-ink-900 bg-ink-50 font-medium text-ink-900' : 'border-ink-300 text-ink-700 hover:border-ink-400'}`}
                >
                  <input
                    type="checkbox"
                    checked={weekdays.includes(day.value)}
                    onChange={() => toggleDay(day.value)}
                    className="size-4"
                  />
                  {day.label.slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      <ModalActions>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving || loadingOptions} disabled={optionsFailed || loadingOptions}>
          Create schedule
        </Button>
      </ModalActions>
    </form>
  );
}

function AttendancePanel({ session }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await sessionService.attendance(session.id));
      setError('');
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load attendance.'));
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (studentId, status) => {
    try {
      await sessionService.updateAttendance(session.id, studentId, status);
      await load();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, 'Unable to update attendance.'));
    }
  };

  if (loading) return <PageLoader label="Loading attendance…" className="py-8" />;
  if (error) return <Alert tone="error">{error}</Alert>;
  return (
    <div className="divide-y divide-ink-200 border-t border-ink-200">
      {items.map((item) => (
        <div key={item.participant?.id ?? item.student.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink-900">
              {item.participant?.name ?? item.student.name ?? `${item.student.firstName} ${item.student.lastName}`}
              <span className="ml-2 text-xs font-normal capitalize text-ink-500">{item.role ?? item.participant?.role}</span>
            </p>
            <p className="text-xs text-ink-500">
              {item.checkInAt
                ? `Joined ${dateTime(item.checkInAt)} · ${Math.floor((item.durationMs ?? 0) / 60_000)} min attended`
                : 'Did not join the class room'}
            </p>
          </div>
          <SelectField
            id={`attendance-${item.participant?.id ?? item.student.id}`}
            label="Status"
            className="sm:w-40"
            value={item.status ?? ''}
            onChange={(event) => setStatus(item.participant?.id ?? item.student.id, event.target.value)}
            options={[
              { value: '', label: 'Not marked yet', disabled: true },
              { value: 'present', label: 'Present' },
              { value: 'late', label: 'Late' },
              { value: 'absent', label: 'Absent' },
            ]}
          />
        </div>
      ))}
      {!items.length && <p className="py-8 text-center text-sm text-ink-500">No students are assigned to this classroom.</p>}
    </div>
  );
}
