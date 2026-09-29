import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Clock3 } from 'lucide-react';
import toast from 'react-hot-toast';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { sessionService } from '../../services/session.service.js';
import { useAuth } from '../../hooks/useAuth.js';
import { getErrorMessage } from '../../utils/errors.js';

const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const formatDate = (value) => new Date(value).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
const localDateValue = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const todayValue = () => localDateValue(new Date());

const STATUS_LABELS = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
};

const STATUS_STYLES = {
  present: 'bg-emerald-50 text-emerald-700',
  late: 'bg-amber-50 text-amber-800',
  absent: 'bg-red-50 text-red-700',
};

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [selectedDate, setSelectedDate] = useState(todayValue);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSessions(await sessionService.list({ view: 'mine' }));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your sessions.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (sessions.some((session) => new Date(session.endsAt).getTime() < currentTime && !session.attendance?.status)) {
        load();
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load, sessions]);

  const confirmCheckIn = async () => {
    setCheckingIn(true);
    try {
      await sessionService.checkIn(selected.id);
      toast.success('Your attendance has been recorded.');
      setSelected(null);
      await load();
    } catch (checkInError) {
      toast.error(getErrorMessage(checkInError, 'Unable to record attendance.'));
    } finally {
      setCheckingIn(false);
    }
  };

  const selectedSessions = sessions.filter((session) => localDateValue(session.startsAt) === selectedDate);

  return (
    <>
      <PageHeader title={`Welcome, ${user.firstName}`} description="View and confirm attendance for your scheduled class sessions." />
      <div className="mb-5 max-w-xs">
        <label htmlFor="attendance-date" className="mb-1.5 block text-sm font-medium text-slate-700">
          Session date
        </label>
        <input
          id="attendance-date"
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <div className="flex justify-center py-16"><Spinner /></div> : selectedSessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <CalendarCheck className="mx-auto size-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-slate-900">No sessions on this date</h2>
          <p className="mt-1 text-sm text-slate-500">Choose another date or check back when your teacher schedules a session.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {selectedSessions.map((session) => {
            const start = new Date(session.startsAt).getTime();
            const end = new Date(session.endsAt).getTime();
            const canCheckIn = session.status !== 'cancelled' && now >= start && now <= end && !session.attendance?.status;
            const attendanceStatus = session.attendance?.status;
            return (
              <article key={session.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Clock3 className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-slate-900">{session.title}</h2>
                    <p className="text-sm text-slate-600">{session.classroom?.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(session.startsAt)} · {formatTime(session.startsAt)}–{formatTime(session.endsAt)}</p>
                    {session.status === 'cancelled' && <p className="mt-1 text-sm font-medium text-slate-500">Cancelled</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  {session.status !== 'cancelled' && (
                    <Button variant="secondary" onClick={() => navigate(`/sessions/${session.id}/room`)}>
                      Open class room
                    </Button>
                  )}
                  {attendanceStatus ? (
                    <span className={`rounded-full px-3 py-1.5 text-sm font-medium ${STATUS_STYLES[attendanceStatus] ?? 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABELS[attendanceStatus] ?? attendanceStatus}
                    </span>
                  ) : session.status === 'cancelled' ? (
                    <span className="text-sm text-slate-500">Not attending</span>
                  ) : canCheckIn ? (
                    <Button onClick={() => setSelected(session)}>Check in</Button>
                  ) : now < start ? (
                    <span className="text-sm text-slate-500">Check-in opens at {formatTime(session.startsAt)}</span>
                  ) : (
                    <span className="text-sm text-slate-500">Attendance pending</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(selected)}
        title="Confirm attendance"
        message={selected
          ? `Check in to ${selected.title} in ${selected.classroom?.name}? ${
              selected.attendanceConditionEnabled === false
                ? 'Attendance conditions are off, so check-ins during class are Present regardless of arrival time.'
                : 'Check-ins within five minutes of the start are Present; later check-ins during class are Late.'
            } No check-in by the end of class is Absent.`
          : ''}
        confirmLabel="Confirm check-in"
        isLoading={checkingIn}
        onConfirm={confirmCheckIn}
        onCancel={() => {
          if (!checkingIn) setSelected(null);
        }}
      />
    </>
  );
}
