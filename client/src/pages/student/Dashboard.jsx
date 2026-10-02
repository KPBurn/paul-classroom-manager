import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Video } from 'lucide-react';
import Alert from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import { controlClass } from '../../components/common/ListFilters.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import { labelClass } from '../../components/common/TextField.jsx';
import { sessionService } from '../../services/session.service.js';
import { useAuth } from '../../hooks/useAuth.js';
import { getErrorMessage } from '../../utils/errors.js';
import { addDays, dateInputToDate, dateInputValue, periodParams } from '../../utils/period.js';

const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const formatDate = (value) => new Date(value).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
const localDateValue = dateInputValue;
const todayValue = () => dateInputValue();

const STATUS_LABELS = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
};

const STATUS_TONES = { present: 'success', late: 'warning', absent: 'danger' };

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayValue);

  // Only the chosen day is loaded. `quiet` refreshes it without replacing the list with a spinner.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!selectedDate) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const day = dateInputToDate(selectedDate);
      setSessions(await sessionService.list({ view: 'mine', ...periodParams(day, addDays(day, 1)) }));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your sessions.'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  // A session that has just finished gets its attendance result; pick it up without a manual refresh.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      if (sessions.some((session) => session.status !== 'cancelled'
        && new Date(session.endsAt).getTime() < currentTime && !session.attendance?.status)) {
        load({ quiet: true });
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load, sessions]);

  const selectedSessions = sessions.filter((session) => localDateValue(session.startsAt) === selectedDate);

  return (
    <>
      <PageHeader title={`Welcome, ${user.firstName}`} description="Join a scheduled class room; attendance is recorded automatically." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="attendance-date" className={labelClass}>
          Session date
        </label>
        <input
          id="attendance-date"
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          className={`${controlClass} w-44 px-2.5`}
        />
      </div>
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      {loading ? <PageLoader label="Loading sessions…" /> : selectedSessions.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No sessions on this date"
          message="Choose another date or check back when your teacher schedules a session."
        />
      ) : (
        <Card as="ul" className="divide-y divide-ink-200">
          {selectedSessions.map((session) => {
            const attendanceStatus = session.attendance?.status;
            const cancelled = session.status === 'cancelled';
            return (
              <li key={session.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <p className={`text-sm tabular-nums ${cancelled ? 'text-ink-400 line-through' : 'font-medium text-ink-900'}`}>
                  {formatTime(session.startsAt)}
                  <span className="font-normal text-ink-500"> – {formatTime(session.endsAt)}</span>
                </p>
                <div className="min-w-0">
                  <h2 className={`truncate text-sm font-medium ${cancelled ? 'text-ink-500' : 'text-ink-900'}`}>{session.title}</h2>
                  <p className="truncate text-xs text-ink-500">
                    {session.classroom?.name} · {formatDate(session.startsAt)}
                    {cancelled && ' · Cancelled'}
                    {!cancelled && session.endedAt && ' · The teacher ended this class'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  {attendanceStatus ? (
                    <Badge tone={STATUS_TONES[attendanceStatus]}>{STATUS_LABELS[attendanceStatus] ?? attendanceStatus}</Badge>
                  ) : (
                    <span className="text-xs text-ink-500">{cancelled ? 'Not attending' : 'Attendance records when you join'}</span>
                  )}
                  {!cancelled && !session.endedAt && (
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/sessions/${session.id}/room`)}>
                      <Video className="size-4" aria-hidden="true" /> Open class room
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </Card>
      )}

    </>
  );
}
