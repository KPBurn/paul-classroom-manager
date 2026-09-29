import {
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock3,
  Megaphone,
  School,
  UsersRound,
  Video,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnnouncementDialog } from '../../components/announcements/AnnouncementFeed.jsx';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useNow } from '../../hooks/useNow.js';
import { announcementService } from '../../services/announcement.service.js';
import { classroomService } from '../../services/classroom.service.js';
import { sessionService } from '../../services/session.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import {
  formatTime,
  isJoinable,
  isSameLocalDay,
  PHASE_LABELS,
  PHASE_STYLES,
  sessionPhase,
  timeUntil,
} from '../../utils/sessionTiming.js';
import { classroomSize } from '../shared/MyClassrooms.jsx';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const linkButton = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const [data, setData] = useState({ sessions: [], classrooms: [], announcements: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openAnnouncement, setOpenAnnouncement] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sessions, classrooms, announcements] = await Promise.all([
        sessionService.list(),
        classroomService.list(),
        announcementService.list({ page: 1, limit: 3 }),
      ]);
      // The schedule also lists open-classroom sessions; the dashboard is about classes you teach.
      const mine = sessions.filter((session) => session.assignments?.teachers?.some((teacher) => teacher.id === user.id));
      setData({ sessions: mine, classrooms, announcements: announcements.items });
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const join = (session) => navigate(`/sessions/${session.id}/room`);

  const sessions = data.sessions
    .map((session) => ({ ...session, phase: sessionPhase(session, now) }))
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const today = sessions.filter((session) => isSameLocalDay(session.startsAt, now));
  const nextUp = sessions.find((session) => session.phase === 'live')
    ?? sessions.find((session) => isJoinable(session.phase));
  const thisWeek = sessions.filter((session) => session.phase !== 'cancelled'
    && new Date(session.startsAt).getTime() >= now
    && new Date(session.startsAt).getTime() - now <= WEEK_MS);
  const studentIds = new Set(data.classrooms.flatMap((classroom) => (classroom.students ?? []).map((student) => student.id)));
  const liveCount = today.filter((session) => session.phase === 'live').length;

  const stats = [
    {
      label: 'Sessions today',
      value: today.filter((session) => session.phase !== 'cancelled').length,
      hint: liveCount ? `${liveCount} live now` : 'Scheduled for today',
      icon: Clock3,
      tone: 'bg-indigo-50 text-indigo-600',
    },
    {
      label: 'Next 7 days',
      value: thisWeek.length,
      hint: 'Upcoming sessions',
      icon: CalendarDays,
      tone: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'My classrooms',
      value: data.classrooms.length,
      hint: 'Including co-taught',
      icon: School,
      tone: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Students',
      value: studentIds.size,
      hint: 'Across your classes',
      icon: UsersRound,
      tone: 'bg-emerald-50 text-emerald-600',
    },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description={new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/teacher/classrooms" className={`${linkButton} bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`}>
              <Megaphone className="size-4" aria-hidden="true" /> Post to a class
            </Link>
            <Link to="/teacher/schedule" className={`${linkButton} bg-indigo-600 text-white hover:bg-indigo-500`}>
              <CalendarPlus className="size-4" aria-hidden="true" /> Schedule session
            </Link>
          </div>
        }
      />

      {error && (
        <div className="mb-6 space-y-3">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" onClick={load}>Try again</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="space-y-6">
          <NextUp session={nextUp} now={now} onJoin={join} />

          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
            {stats.map(({ label, value, hint, icon: Icon, tone }) => (
              <li key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-600">{label}</p>
                  <span className={`flex size-8 items-center justify-center rounded-lg ${tone}`}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
                <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
              </li>
            ))}
          </ul>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white shadow-xs lg:col-span-2" aria-labelledby="today-heading">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <h2 id="today-heading" className="font-semibold text-slate-900">Today’s schedule</h2>
                <Link to="/teacher/schedule" className="text-sm font-medium text-indigo-700 hover:text-indigo-800">Full schedule</Link>
              </div>
              {today.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <CalendarDays className="mx-auto size-7 text-slate-400" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium text-slate-900">No sessions today</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {nextUp ? `Your next session is ${formatDateTime(nextUp.startsAt)}.` : 'Schedule a session to see it here.'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {today.map((session) => (
                    <li key={session.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <div className="w-16 shrink-0 text-sm">
                          <p className="font-semibold text-slate-900">{formatTime(session.startsAt)}</p>
                          <p className="text-xs text-slate-500">{formatTime(session.endsAt)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{session.title}</p>
                          <p className="truncate text-sm text-slate-500">{session.classroom?.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:justify-end">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${PHASE_STYLES[session.phase]}`}>
                          {session.phase === 'upcoming' ? `Starts ${timeUntil(session.startsAt, now)}` : PHASE_LABELS[session.phase]}
                        </span>
                        {(isJoinable(session.phase) || session.phase === 'closed') && (
                          <Button
                            className="!px-3 !py-2"
                            variant={session.phase === 'live' ? 'primary' : 'secondary'}
                            onClick={() => join(session)}
                          >
                            <Video className="size-4" aria-hidden="true" /> Join
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 bg-white shadow-xs" aria-labelledby="classes-heading">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                  <h2 id="classes-heading" className="font-semibold text-slate-900">My classrooms</h2>
                  <Link to="/teacher/classrooms" className="text-sm font-medium text-indigo-700 hover:text-indigo-800">View all</Link>
                </div>
                {data.classrooms.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500">No classrooms are assigned to you yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.classrooms.slice(0, 5).map((classroom) => (
                      <li key={classroom.id}>
                        <Link
                          to={`/teacher/classrooms/${classroom.id}`}
                          className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900">{classroom.name}</span>
                            <span className="text-xs text-slate-500">{classroomSize(classroom)} students</span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white shadow-xs" aria-labelledby="news-heading">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                  <h2 id="news-heading" className="font-semibold text-slate-900">From the school</h2>
                  <Link to="/teacher/announcements" className="text-sm font-medium text-indigo-700 hover:text-indigo-800">View all</Link>
                </div>
                {data.announcements.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500">No announcements from administrators yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.announcements.map((announcement) => (
                      <li key={announcement.id}>
                        <button
                          type="button"
                          onClick={() => setOpenAnnouncement(announcement)}
                          className="block w-full px-5 py-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600"
                        >
                          <span className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">{announcement.type}</span>
                            <time dateTime={announcement.createdAt}>{formatDateTime(announcement.createdAt)}</time>
                          </span>
                          <span className="mt-1 block text-sm font-medium text-slate-900">{announcement.title}</span>
                          <span className="mt-0.5 line-clamp-2 text-sm text-slate-600">{announcement.body}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
      <AnnouncementDialog announcement={openAnnouncement} onClose={() => setOpenAnnouncement(null)} />
    </>
  );
}

function NextUp({ session, now, onJoin }) {
  if (!session) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
        <p className="font-semibold text-slate-900">Nothing coming up</p>
        <p className="mt-1 text-sm text-slate-500">You have no upcoming sessions. Schedule one from the Schedule page.</p>
      </section>
    );
  }

  const live = session.phase === 'live';
  const today = isSameLocalDay(session.startsAt, now);
  const when = live
    ? `Live now · ends at ${formatTime(session.endsAt)}`
    : `${today ? 'Today' : new Date(session.startsAt).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} · ${formatTime(session.startsAt)}–${formatTime(session.endsAt)}`;

  return (
    <section
      className={`flex flex-col gap-5 rounded-2xl p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between ${live ? 'bg-emerald-600' : 'bg-indigo-600'}`}
      aria-labelledby="next-up-heading"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
          {live && <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden="true" />}
          {live ? 'Happening now' : 'Next up'}
        </p>
        <h2 id="next-up-heading" className="mt-1 truncate text-xl font-semibold">{session.title}</h2>
        <p className="mt-1 text-sm text-white/85">{session.classroom?.name} · {when}</p>
        {!live && timeUntil(session.startsAt, now) && (
          <p className="mt-1 text-sm font-medium">Starts {timeUntil(session.startsAt, now)}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onJoin(session)}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold shadow-sm transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${live ? 'text-emerald-700' : 'text-indigo-700'}`}
      >
        <Video className="size-5" aria-hidden="true" /> {live ? 'Join now' : 'Join session'}
      </button>
    </section>
  );
}
