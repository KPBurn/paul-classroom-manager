import { useCallback, useEffect, useRef, useState } from 'react';
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
import { controlClass, FilterSelect, ListToolbar, SearchInput } from '../../components/common/ListFilters.jsx';
import Modal, { ModalActions } from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import { inputClass, labelClass, SelectField } from '../../components/common/TextField.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { sessionService } from '../../services/session.service.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useNow } from '../../hooks/useNow.js';
import { ROLES } from '../../utils/roles.js';
import { getErrorMessage } from '../../utils/errors.js';
import { addDays, dateInputToDate, dateInputValue, periodParams, startOfDay } from '../../utils/period.js';
import {
  formatTime,
  isJoinable,
  isSameLocalDay,
  PHASE_LABELS,
  PHASE_TONES,
  sessionPhase,
} from '../../utils/sessionTiming.js';

const PAGE_SIZE = 40;
// The most the API returns in one page.
const MAX_PAGE_SIZE = 100;
const SEARCH_DELAY_MS = 300;
const PAST_DAYS = 90;
const WHEN_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'past', label: `Past ${PAST_DAYS} days` },
  { value: 'custom', label: 'Choose dates' },
];

/**
 * The period each "Dates" choice covers, as `[from, to]`; an open end is left out.
 * Only that period is loaded, so the list never carries the whole history.
 */
function periodFor(when, custom) {
  const now = new Date();
  const today = startOfDay(now);
  switch (when) {
    case 'today': return [today, addDays(today, 1)];
    case 'week': return [now, addDays(now, 7)];
    case 'past': return [addDays(today, -PAST_DAYS), now];
    case 'custom': return [dateInputToDate(custom.from), addDays(dateInputToDate(custom.to), 1)];
    default: return [now];
  }
}
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

/** A classroom's members who can take part; accounts that are not active are left out of new sessions. */
const activeMembers = (people) => (people ?? [])
  .filter((person) => person && typeof person === 'object' && (person.status ?? 'active') === 'active');
const memberName = (person) => person.name ?? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();

export default function TeacherSchedule() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;
  // The sessions loaded so far; the server holds `total` and hands out the rest a page at a time.
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [classrooms, setClassrooms] = useState([]);
  const [classroomsLoaded, setClassroomsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Counts list requests, so an answer that arrives after a newer request is ignored.
  const latestRequest = useRef(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editSession, setEditSession] = useState(null);
  const [attendanceSession, setAttendanceSession] = useState(null);
  const [cancelSession, setCancelSession] = useState(null);
  const [cancelScope, setCancelScope] = useState('occurrence');
  const [busy, setBusy] = useState(false);
  const [attendanceSettingsId, setAttendanceSettingsId] = useState(null);
  const [query, setQuery] = useState('');
  // What was last searched for: `query`, once typing has paused.
  const [search, setSearch] = useState('');
  const [when, setWhen] = useState('upcoming');
  // The dates for "Choose dates": the last and the next 30 days to begin with.
  const [custom, setCustom] = useState(() => ({
    from: dateInputValue(addDays(new Date(), -30)),
    to: dateInputValue(addDays(new Date(), 30)),
  }));
  const customValid = Boolean(custom.from && custom.to && custom.from <= custom.to);
  const [classroomFilter, setClassroomFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const now = useNow();

  useEffect(() => {
    const text = query.trim();
    if (text === search) return undefined;
    const timer = setTimeout(() => setSearch(text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, search]);

  // The filters are applied by the server, so a page holds only sessions that match.
  const listParams = useCallback(() => ({
    ...periodParams(...periodFor(when, custom)),
    ...(when === 'past' && { order: 'desc' }),
    ...(statusFilter && { status: statusFilter }),
    ...(classroomFilter && { classroomId: classroomFilter }),
    ...(search && { search }),
  }), [when, custom, statusFilter, classroomFilter, search]);

  // Loads the list from its start. `size` reloads as many sessions as are already shown.
  const load = useCallback(async ({ size = PAGE_SIZE } = {}) => {
    if (when === 'custom' && !customValid) return;
    latestRequest.current += 1;
    const request = latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const page = await sessionService.page({ ...listParams(), limit: size });
      if (request !== latestRequest.current) return;
      setSessions(page.items);
      setTotal(page.total);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      if (request === latestRequest.current) setError(getErrorMessage(loadError, 'Unable to load your schedule.'));
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [listParams, when, customValid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    classroomService.list()
      .then((classes) => {
        if (!cancelled) setClassrooms(classes);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError, 'Unable to load your classrooms.'));
      })
      .finally(() => {
        if (!cancelled) setClassroomsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showMore = async () => {
    const request = latestRequest.current;
    setLoadingMore(true);
    try {
      const page = await sessionService.page({ ...listParams(), limit: PAGE_SIZE, cursor: nextCursor });
      // The filters changed while this page was on its way: it belongs to the old list.
      if (request !== latestRequest.current) return;
      setSessions((current) => {
        const shown = new Set(current.map((session) => session.id));
        return [...current, ...page.items.filter((session) => !shown.has(session.id))];
      });
      setTotal(page.total);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      toast.error(getErrorMessage(loadError, 'Unable to load more sessions.'));
    } finally {
      setLoadingMore(false);
    }
  };

  // After a change that can move sessions around, reload what is shown without clearing the list.
  const refresh = () => load({ size: Math.min(MAX_PAGE_SIZE, Math.max(PAGE_SIZE, sessions.length)) });

  // Puts the changed details of saved sessions into the rows already shown.
  const applyChanges = (changed) => {
    const byId = new Map(changed.map((session) => [session.id, session]));
    setSessions((current) => current.map((session) => {
      const saved = byId.get(session.id);
      return saved
        ? { ...session, status: saved.status, attendanceConditionEnabled: saved.attendanceConditionEnabled }
        : session;
    }));
  };

  const cancel = async (scope = cancelScope) => {
    setBusy(true);
    try {
      applyChanges(await sessionService.cancel(cancelSession.id, scope));
      toast.success(scope === 'series' ? 'Schedule series cancelled.' : 'Session cancelled.');
      setCancelSession(null);
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, 'Unable to cancel session.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleAttendanceCondition = async (session) => {
    setAttendanceSettingsId(session.id);
    try {
      applyChanges(await sessionService.update(session.id, {
        scope: 'occurrence',
        attendanceConditionEnabled: !session.attendanceConditionEnabled,
      }));
      toast.success(
        session.attendanceConditionEnabled
          ? 'Attendance conditions turned off for this session.'
          : 'Attendance conditions turned on for this session.',
      );
    } catch (toggleError) {
      toast.error(getErrorMessage(toggleError, 'Unable to update attendance conditions.'));
    } finally {
      setAttendanceSettingsId(null);
    }
  };

  // Every classroom you can schedule, plus any others that have sessions in the period shown.
  const classroomOptions = [
    { value: '', label: 'All classrooms' },
    ...[...new Map([
      ...classrooms.map((classroom) => [classroom.id, classroom.name]),
      ...sessions.map((session) => [session.classroom?.id, session.classroom?.name]),
    ]).entries()]
      .filter(([classroomId]) => classroomId)
      .sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))
      .map(([value, label]) => ({ value, label })),
  ];
  const filtered = sessions
    .map((session) => ({ ...session, phase: sessionPhase(session, now) }))
    .filter((session) => {
      // The server applied the filters when loading; this keeps the list right as time passes
      // on an open page, and after a session shown here is cancelled.
      const endsAt = new Date(session.endsAt).getTime();
      const inRange = {
        upcoming: endsAt > now,
        today: isSameLocalDay(session.startsAt, now),
        week: endsAt > now,
        past: endsAt <= now,
        custom: true,
      }[when];
      const statusMatches = !statusFilter
        || (statusFilter === 'cancelled') === (session.status === 'cancelled');
      return inRange && statusMatches && (!classroomFilter || session.classroom?.id === classroomFilter);
    })
    .sort((a, b) => (when === 'past' ? -1 : 1) * (new Date(a.startsAt) - new Date(b.startsAt)));
  // Sessions that match on the server, less any loaded ones that no longer belong in the list.
  const matching = Math.max(filtered.length, total - (sessions.length - filtered.length));
  const days = [];
  for (const session of filtered) {
    const key = new Date(session.startsAt).toDateString();
    if (days.at(-1)?.key !== key) days.push({ key, date: session.startsAt, sessions: [] });
    days.at(-1).sessions.push(session);
  }
  const hasFilters = Boolean(query || classroomFilter || statusFilter || when !== 'upcoming');
  const clearFilters = () => {
    setQuery('');
    setSearch('');
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
      {!classrooms.length && classroomsLoaded && (
        <div className="mb-4">
          <Alert>{isAdmin
            ? 'Create an active classroom before scheduling classes.'
            : 'Your administrator needs to assign you to a classroom before you can schedule a session.'}</Alert>
        </div>
      )}

      <ListToolbar count={loading ? undefined : matching} noun="session">
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
          {when === 'custom' && (
            <div className="col-span-2 flex items-center gap-2 text-xs text-ink-500">
              <input
                type="date"
                value={custom.from}
                max={custom.to || undefined}
                onChange={(event) => setCustom((current) => ({ ...current, from: event.target.value }))}
                className={`${controlClass} min-w-0 flex-1 px-2.5 sm:w-36 sm:flex-none`}
                aria-label="From date"
              />
              to
              <input
                type="date"
                value={custom.to}
                min={custom.from || undefined}
                onChange={(event) => setCustom((current) => ({ ...current, to: event.target.value }))}
                className={`${controlClass} min-w-0 flex-1 px-2.5 sm:w-36 sm:flex-none`}
                aria-label="To date"
              />
            </div>
          )}
          <FilterSelect id="schedule-status" label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} className="sm:w-36" />
          <FilterSelect id="schedule-classroom" label="Classroom" value={classroomFilter} onChange={setClassroomFilter} options={classroomOptions} className="col-span-2 sm:w-48" />
        </div>
      </ListToolbar>

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      {when === 'custom' && !customValid ? (
        <EmptyState icon={CalendarDays} title="Choose a start and an end date" message="The end date must be on or after the start date." />
      ) : loading && filtered.length === 0 ? <PageLoader label="Loading schedule…" /> : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={hasFilters ? 'No sessions match your filters' : 'No upcoming sessions'}
          message={hasFilters ? 'Try another search, date range or classroom.' : 'Create a schedule to see it here. Earlier sessions are under Dates.'}
          action={hasFilters && (
            <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
          )}
        />
      ) : (
        // The list stays in view, dimmed, while it is reloaded.
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
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
          {nextCursor && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={showMore} isLoading={loadingMore} disabled={loading}>
                Show more ({Math.max(1, total - sessions.length)} left)
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
            await refresh();
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
            onCancel={() => setEditSession(null)}
            onSave={async (changes) => {
              await sessionService.update(editSession.id, changes);
              toast.success('Session updated.');
              setEditSession(null);
              // A new date or time can move the session, so the list is read again.
              await refresh();
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

function EditSessionForm({ session, onCancel, onSave }) {
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
      {scope === 'series' && (
        <p className="text-xs text-ink-500">Applies to every occurrence in this series that has not started yet.</p>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleDay = (day) => setWeekdays((current) => current.includes(day)
    ? current.filter((value) => value !== day)
    : [...current, day].sort((a, b) => a - b));

  // A session takes everyone in its classroom; only administrators change who that is.
  const classroom = classrooms.find((room) => room.id === classroomId);
  const included = {
    teachers: activeMembers(classroom?.teachers?.length ? classroom.teachers : [classroom?.teacher]),
    students: activeMembers(classroom?.students),
  };

  const submit = async (event) => {
    event.preventDefault();
    // Name the one thing that is wrong, so it is clear what to fix.
    const problem = !classroomId ? 'Choose a classroom.'
      : !title.trim() ? 'Enter a session title.'
        : !included.teachers.length ? 'This classroom has no active teacher. Ask an administrator to assign one.'
          : !startTime || !endTime ? 'Set a start and an end time.'
            : startTime >= endTime ? 'The end time must be after the start time, on the same day.'
              : '';
    if (problem) {
      setError(problem);
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
        classroomId, title: title.trim(), startDate, endDate, startTime, endTime, weekdays,
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
      <section aria-labelledby="session-included" className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
        <h3 id="session-included" className="text-sm font-medium text-ink-900">Who is included</h3>
        <dl className="mt-2 grid gap-3 text-sm md:grid-cols-2">
          {[
            ['Teachers', included.teachers, 'No active teacher is assigned.'],
            ['Students', included.students, 'No students are enrolled yet.'],
          ].map(([label, people, emptyMessage]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-ink-500">{label} <span className="tabular-nums">({people.length})</span></dt>
              <dd className="mt-0.5 max-h-24 overflow-y-auto text-ink-700">
                {people.length ? people.map(memberName).join(', ') : <span className="text-ink-500">{emptyMessage}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-500">
          Everyone in the classroom is included.{' '}
          {actor.role === ROLES.ADMIN
            ? 'To change who that is, edit the classroom.'
            : 'Ask an administrator to change who is in the classroom.'}
        </p>
      </section>
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
        <Button type="submit" isLoading={saving}>
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
