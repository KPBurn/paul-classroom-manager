import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Plus, UsersRound } from 'lucide-react';
import toast from 'react-hot-toast';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import Modal from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { SelectField } from '../../components/common/TextField.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { sessionService } from '../../services/session.service.js';
import { getErrorMessage } from '../../utils/errors.js';

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

export default function TeacherSchedule() {
  const navigate = useNavigate();
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

  return (
    <>
      <PageHeader
        title="Schedule"
        description="Create dated sessions for your classrooms and review attendance."
        actions={
          <Button onClick={() => setFormOpen(true)} disabled={!classrooms.length}>
            <Plus className="size-4" aria-hidden="true" />
            Create Session
          </Button>
        }
      />
      {!classrooms.length && !loading && (
        <Alert>Your administrator needs to assign you to a classroom before you can schedule a session.</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {sessions.length === 0 ? (
            <p className="px-6 py-14 text-center text-sm text-slate-500">No sessions scheduled yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <li key={session.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <CalendarDays className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="font-semibold text-slate-900">{session.title}</h2>
                      <p className="text-sm text-slate-600">{session.classroom?.name ?? 'Classroom'}</p>
                      <p className="mt-1 text-sm text-slate-500">{dateTime(session.startsAt)} – {new Date(session.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Attendance conditions: {session.attendanceConditionEnabled === false ? 'Off · check-ins during class are Present' : 'On · check-ins after 5 minutes are Late'}
                      </p>
                      {session.status === 'cancelled' && <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Cancelled</span>}
                    </div>
                  </div>
                  {session.status !== 'cancelled' && (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => navigate(`/sessions/${session.id}/room`)}>
                        Open class room
                      </Button>
                      <Button
                        variant="secondary"
                        role="switch"
                        aria-checked={session.attendanceConditionEnabled !== false}
                        aria-label={`Attendance conditions ${session.attendanceConditionEnabled === false ? 'off' : 'on'} for ${session.title}`}
                        disabled={attendanceSettingsId === session.id}
                        isLoading={attendanceSettingsId === session.id}
                        onClick={() => toggleAttendanceCondition(session)}
                      >
                        Conditions {session.attendanceConditionEnabled === false ? 'Off' : 'On'}
                      </Button>
                      <Button variant="secondary" onClick={() => setAttendanceSession(session)}>
                        <UsersRound className="size-4" aria-hidden="true" />
                        Attendance
                      </Button>
                      <Button variant="secondary" onClick={() => setEditSession(session)}>Edit</Button>
                      <Button variant="secondary" onClick={() => {
                        setCancelScope('occurrence');
                        setCancelSession(session);
                      }}>Cancel</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Create Sessions" description="Check-in is available from the start through the end of each session.">
        <SessionForm
          classrooms={classrooms}
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
        <p className="text-sm text-slate-600">Choose whether to cancel only this date or the entire series.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setCancelSession(null)} disabled={busy}>Keep session</Button>
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
      <label className="block text-sm font-medium text-slate-700">Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
      </label>
      <label className="block text-sm font-medium text-slate-700">Date
        <input type="date" value={date} disabled={scope === 'series'} onChange={(event) => setDate(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50" required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">Starts
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
        </label>
        <label className="block text-sm font-medium text-slate-700">Ends
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
        </label>
      </div>
      {scope === 'series' && seriesSessions.length > 0 && (
        <p className="text-xs text-slate-500">Applies to {seriesSessions.length} occurrences in this series.</p>
      )}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving}>Save changes</Button>
      </div>
    </form>
  );
}

function SessionForm({ classrooms, onCancel, onSave }) {
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

  const submit = async (event) => {
    event.preventDefault();
    if (!classroomId || !title.trim() || startTime >= endTime) {
      setError('Choose a classroom, enter a session title, and set an end time after the start.');
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
      values = { classroomId, title: title.trim(), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
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
      <SelectField id="session-classroom" label="Classroom" value={classroomId} onChange={(event) => setClassroomId(event.target.value)} options={classrooms.map((room) => ({ value: room.id, label: room.name }))} />
      <label className="block text-sm font-medium text-slate-700">Session title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
      </label>
      <SelectField id="session-type" label="Schedule type" value={mode} onChange={(event) => setMode(event.target.value)} options={[{ value: 'single', label: 'One-time session' }, { value: 'recurring', label: 'Recurring weekly sessions' }]} />
      {mode === 'single' ? (
        <label className="block text-sm font-medium text-slate-700">Date
          <input type="date" min={localDate} value={date} onChange={(event) => setDate(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
        </label>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">First date
              <input type="date" min={localDate} value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
            </label>
            <label className="block text-sm font-medium text-slate-700">Last date
              <input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Repeat on</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label key={day.value} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-sm">
                  <input type="checkbox" checked={weekdays.includes(day.value)} onChange={() => toggleDay(day.value)} />
                  {day.label.slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">Starts
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
        </label>
        <label className="block text-sm font-medium text-slate-700">Ends
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving}>Create sessions</Button>
      </div>
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

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (error) return <Alert tone="error">{error}</Alert>;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.student.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-slate-900">{item.student.name ?? `${item.student.firstName} ${item.student.lastName}`}</p>
            <p className="text-xs text-slate-500">{item.checkInAt ? `Checked in ${dateTime(item.checkInAt)}` : 'No check-in recorded'}</p>
          </div>
          <SelectField
            id={`attendance-${item.student.id}`}
            label="Status"
            className="sm:w-40"
            value={item.status ?? ''}
            onChange={(event) => setStatus(item.student.id, event.target.value)}
            options={[
              { value: '', label: 'Not marked yet', disabled: true },
              { value: 'present', label: 'Present' },
              { value: 'late', label: 'Late' },
              { value: 'absent', label: 'Absent' },
            ]}
          />
        </div>
      ))}
      {!items.length && <p className="py-8 text-center text-sm text-slate-500">No students are assigned to this classroom.</p>}
    </div>
  );
}
