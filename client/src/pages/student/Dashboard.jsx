import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CalendarDays, Video, X } from 'lucide-react';
import Alert, { ErrorState } from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card, { CardHeader } from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import { controlClass } from '../../components/common/ListFilters.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import StatStrip from '../../components/common/StatStrip.jsx';
import NextUp from '../../components/sessions/NextUp.jsx';
import { sessionService } from '../../services/session.service.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useNow } from '../../hooks/useNow.js';
import { getErrorMessage } from '../../utils/errors.js';
import { addDays, dateInputToDate, dateInputValue, periodParams, startOfDay } from '../../utils/period.js';
import {
  formatTime,
  isJoinable,
  isSameLocalDay,
  PHASE_LABELS,
  PHASE_TONES,
  sessionPhase,
  timeUntil,
} from '../../utils/sessionTiming.js';

// How far back attendance is summarised, and how far ahead classes are listed.
const HISTORY_DAYS = 30;
const DAYS_AHEAD = 30;
const WEEK_DAYS = 7;
const HISTORY_SHOWN = 8;

const STATUS_LABELS = { present: 'Present', late: 'Late', absent: 'Absent' };
const STATUS_TONES = { present: 'success', late: 'warning', absent: 'danger' };

const formatDay = (value, now) => (isSameLocalDay(value, now)
  ? 'Today'
  : new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));

/** One session: when it is, what it is, and either how to join it or how attendance went. */
function SessionRow({ session, now, onJoin }) {
  const cancelled = session.status === 'cancelled';
  const attendanceStatus = session.attendance?.status;
  const joinable = isJoinable(session.phase) && !session.endedAt;
  return (
    <li className="grid gap-2 px-5 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <p className={`text-sm tabular-nums ${cancelled ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
        <span className="font-medium">{formatDay(session.startsAt, now)}</span>
        <span className="block text-xs text-ink-500">{formatTime(session.startsAt)}–{formatTime(session.endsAt)}</span>
      </p>
      <div className="min-w-0">
        <p className={`truncate text-sm font-medium ${cancelled ? 'text-ink-500' : 'text-ink-900'}`}>{session.title}</p>
        <p className="truncate text-xs text-ink-500">
          {session.classroom?.name}
          {!cancelled && session.endedAt && session.phase !== 'ended' && ' · The teacher ended this class'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        {attendanceStatus ? (
          <Badge tone={STATUS_TONES[attendanceStatus]}>{STATUS_LABELS[attendanceStatus] ?? attendanceStatus}</Badge>
        ) : (
          <Badge tone={PHASE_TONES[session.phase]}>
            {session.phase === 'upcoming' && timeUntil(session.startsAt, now) && isSameLocalDay(session.startsAt, now)
              ? `Starts ${timeUntil(session.startsAt, now)}`
              : PHASE_LABELS[session.phase]}
          </Badge>
        )}
        {joinable && (
          <Button size="sm" variant={session.phase === 'live' ? 'primary' : 'secondary'} onClick={() => onJoin(session)}>
            <Video className="size-4" aria-hidden="true" /> Join
          </Button>
        )}
      </div>
    </li>
  );
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const now = useNow();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Looking up one day outside the usual view: `date` is empty until the student picks one.
  const [lookup, setLookup] = useState({ date: '', sessions: [], loading: false, error: '' });

  // `quiet` refreshes without replacing the page with a spinner.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const today = startOfDay();
      setSessions(await sessionService.list({
        view: 'mine',
        ...periodParams(addDays(today, -HISTORY_DAYS), addDays(today, DAYS_AHEAD)),
      }));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your sessions.'));
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (!lookup.date) return undefined;
    let cancelled = false;
    setLookup((current) => ({ ...current, loading: true, error: '' }));
    const day = dateInputToDate(lookup.date);
    sessionService.list({ view: 'mine', ...periodParams(day, addDays(day, 1)) })
      .then((items) => {
        if (!cancelled) setLookup((current) => ({ ...current, sessions: items, loading: false }));
      })
      .catch((lookupError) => {
        if (!cancelled) {
          setLookup((current) => ({
            ...current,
            sessions: [],
            loading: false,
            error: getErrorMessage(lookupError, 'Unable to load that day.'),
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lookup.date]);

  const join = (session) => navigate(`/sessions/${session.id}/room`);
  const withPhase = (items) => items
    .map((session) => ({ ...session, phase: sessionPhase(session, now) }))
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

  const all = withPhase(sessions);
  const ahead = all.filter((session) => isJoinable(session.phase) && !session.endedAt);
  const nextUp = ahead.find((session) => session.phase === 'live') ?? ahead[0];
  const weekEnd = addDays(startOfDay(now), WEEK_DAYS).getTime();
  const thisWeek = all.filter((session) => new Date(session.endsAt).getTime() > now
    && new Date(session.startsAt).getTime() < weekEnd);
  // Finished classes you were expected at, newest first.
  const history = all
    .filter((session) => session.status !== 'cancelled' && new Date(session.endsAt).getTime() <= now && session.attendance?.status)
    .reverse();
  const count = (status) => history.filter((session) => session.attendance.status === status).length;
  const attended = count('present') + count('late');

  const stats = [
    {
      label: 'Classes attended',
      value: history.length ? `${attended} of ${history.length}` : '0',
      hint: history.length ? `${Math.round((attended / history.length) * 100)}% in the last ${HISTORY_DAYS} days` : `None in the last ${HISTORY_DAYS} days`,
    },
    { label: 'Late', value: count('late'), hint: 'Joined after the first five minutes' },
    { label: 'Absent', value: count('absent'), hint: 'Classes you did not join', emphasis: count('absent') > 0 },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description={new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      />

      {error && <ErrorState message={error} onRetry={load} className="mb-6" />}

      {loading ? (
        <PageLoader label="Loading your classes…" />
      ) : sessions.length === 0 && !error && !lookup.date ? (
        <EmptyState
          icon={CalendarCheck}
          title="No classes yet"
          message="Your classes will appear here once your school enrolls you and a teacher schedules a session."
        />
      ) : (
        <div className="space-y-6">
          <NextUp
            session={nextUp}
            now={now}
            onJoin={join}
            emptyMessage={`You have no classes scheduled in the next ${DAYS_AHEAD} days.`}
          />

          <StatStrip stats={stats} columns="sm:grid-cols-3" label={`Attendance in the last ${HISTORY_DAYS} days`} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card as="section" className="self-start" aria-labelledby="week-heading">
              <CardHeader title="Next 7 days" titleId="week-heading" icon={CalendarDays} />
              {thisWeek.length === 0 ? (
                <p className="px-5 py-5 text-sm text-ink-500">No classes in the next seven days.</p>
              ) : (
                <ul className="divide-y divide-ink-200">
                  {thisWeek.map((session) => <SessionRow key={session.id} session={session} now={now} onJoin={join} />)}
                </ul>
              )}
            </Card>

            <Card as="section" className="self-start" aria-labelledby="attendance-heading">
              <CardHeader
                title={lookup.date ? 'Attendance on a date' : 'Recent attendance'}
                titleId="attendance-heading"
                icon={CalendarCheck}
                action={(
                  <div className="flex items-center gap-1">
                    <label htmlFor="attendance-date" className="sr-only">Look up a date</label>
                    <input
                      id="attendance-date"
                      type="date"
                      value={lookup.date}
                      max={dateInputValue(addDays(new Date(), DAYS_AHEAD))}
                      onChange={(event) => setLookup((current) => ({ ...current, date: event.target.value }))}
                      className={`${controlClass} h-8 w-36 px-2 text-xs`}
                      title="Look up a date"
                    />
                    {lookup.date && (
                      <Button variant="ghost" size="sm" className="min-h-8 px-2" onClick={() => setLookup({ date: '', sessions: [], loading: false, error: '' })} aria-label="Back to recent attendance">
                        <X className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                )}
              />
              {lookup.date ? (
                lookup.loading ? (
                  <PageLoader label="Loading that day…" className="py-8" />
                ) : lookup.error ? (
                  <div className="p-5"><Alert tone="error">{lookup.error}</Alert></div>
                ) : lookup.sessions.length === 0 ? (
                  <p className="px-5 py-5 text-sm text-ink-500">You had no classes on this date.</p>
                ) : (
                  <ul className="divide-y divide-ink-200">
                    {withPhase(lookup.sessions).map((session) => <SessionRow key={session.id} session={session} now={now} onJoin={join} />)}
                  </ul>
                )
              ) : history.length === 0 ? (
                <p className="px-5 py-5 text-sm text-ink-500">
                  No finished classes in the last {HISTORY_DAYS} days. Attendance is recorded when you join a class.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-ink-200">
                    {history.slice(0, showAllHistory ? history.length : HISTORY_SHOWN).map((session) => (
                      <SessionRow key={session.id} session={session} now={now} onJoin={join} />
                    ))}
                  </ul>
                  {history.length > HISTORY_SHOWN && (
                    <div className="border-t border-ink-200 px-3 py-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowAllHistory((current) => !current)}>
                        {showAllHistory ? 'Show fewer' : `Show all ${history.length}`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
