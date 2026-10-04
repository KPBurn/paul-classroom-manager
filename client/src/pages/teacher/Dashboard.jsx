import { CalendarDays, CalendarPlus, ChevronRight, Megaphone, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnnouncementDialog } from '../../components/announcements/AnnouncementFeed.jsx';
import { ErrorState } from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button, { ButtonLink } from '../../components/common/Button.jsx';
import Card, { CardHeader, textLinkClass } from '../../components/common/Card.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import NextUp from '../../components/sessions/NextUp.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import StatStrip from '../../components/common/StatStrip.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import FeedbackReminder from '../../components/feedback/FeedbackReminder.jsx';
import { useFeedbackReminder } from '../../context/FeedbackReminderContext.jsx';
import { useNow } from '../../hooks/useNow.js';
import { announcementService } from '../../services/announcement.service.js';
import { classroomService } from '../../services/classroom.service.js';
import { sessionService } from '../../services/session.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { addDays, periodParams, startOfDay } from '../../utils/period.js';
import { formatDateTime } from '../../utils/format.js';
import {
  canJoinOpenClassroomAnytime,
  formatTime,
  isJoinable,
  isSameLocalDay,
  PHASE_LABELS,
  PHASE_TONES,
  sessionPhase,
  timeUntil,
} from '../../utils/sessionTiming.js';
import { classroomSize } from '../shared/MyClassrooms.jsx';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAYS_AHEAD = 30;

export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const { pending, refresh: refreshReminder } = useFeedbackReminder();
  const [data, setData] = useState({ sessions: [], classrooms: [], announcements: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openAnnouncement, setOpenAnnouncement] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sessions, classrooms, announcements] = await Promise.all([
        // Today, the week ahead, and far enough on to find the next session after a quiet spell.
        sessionService.list(periodParams(startOfDay(), addDays(startOfDay(), DAYS_AHEAD))),
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
    refreshReminder();
  }, [load, refreshReminder]);

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
    },
    { label: 'Next 7 days', value: thisWeek.length, hint: 'Upcoming sessions' },
    { label: 'My classrooms', value: data.classrooms.length, hint: 'Including co-taught' },
    { label: 'Students', value: studentIds.size, hint: 'Across your classes' },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description={new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={
          <>
            <ButtonLink to="/teacher/classrooms" variant="secondary">
              <Megaphone className="size-4" aria-hidden="true" /> Post to a class
            </ButtonLink>
            <ButtonLink to="/teacher/schedule">
              <CalendarPlus className="size-4" aria-hidden="true" /> Schedule session
            </ButtonLink>
          </>
        }
      />

      <FeedbackReminder pending={pending} />

      {error && <ErrorState message={error} onRetry={load} className="mb-6" />}

      {loading ? (
        <PageLoader label="Loading dashboard…" />
      ) : (
        <div className="space-y-6">
          <NextUp
            session={nextUp}
            now={now}
            onJoin={join}
            emptyMessage="You have no upcoming sessions. Schedule one from the Schedule page."
          />

          <StatStrip stats={stats} label="Summary" />

          <div className="grid gap-6 lg:grid-cols-3">
            <Card as="section" className="self-start lg:col-span-2" aria-labelledby="today-heading">
              <CardHeader
                title="Today’s schedule"
                titleId="today-heading"
                action={<Link to="/teacher/schedule" className={textLinkClass}>Full schedule</Link>}
              />
              {today.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <CalendarDays className="mx-auto size-6 text-ink-400" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-ink-900">No sessions today</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {nextUp ? `Your next session is ${formatDateTime(nextUp.startsAt)}.` : 'Schedule a session to see it here.'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-ink-200">
                  {today.map((session) => (
                    <li key={session.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <div className="w-16 shrink-0 text-sm tabular-nums">
                          <p className="font-medium text-ink-900">{formatTime(session.startsAt)}</p>
                          <p className="text-xs text-ink-500">{formatTime(session.endsAt)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{session.title}</p>
                          <p className="truncate text-xs text-ink-500">{session.classroom?.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:justify-end">
                        <Badge tone={PHASE_TONES[session.phase]}>
                          {session.phase === 'upcoming' ? `Starts ${timeUntil(session.startsAt, now)}` : PHASE_LABELS[session.phase]}
                        </Badge>
                        {(isJoinable(session.phase) || session.phase === 'closed' || canJoinOpenClassroomAnytime(session)) && (
                          <Button
                            size="sm"
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
            </Card>

            <div className="space-y-6">
              <Card as="section" aria-labelledby="classes-heading">
                <CardHeader
                  title="My classrooms"
                  titleId="classes-heading"
                  action={<Link to="/teacher/classrooms" className={textLinkClass}>View all</Link>}
                />
                {data.classrooms.length === 0 ? (
                  <p className="px-5 py-5 text-sm text-ink-500">No classrooms are assigned to you yet.</p>
                ) : (
                  <ul className="divide-y divide-ink-200">
                    {data.classrooms.slice(0, 5).map((classroom) => {
                      const size = classroomSize(classroom);
                      return (
                        <li key={classroom.id}>
                          <Link
                            to={`/teacher/classrooms/${classroom.id}`}
                            className="group flex items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-ink-50 focus-visible:-outline-offset-2"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink-900">{classroom.name}</span>
                              <span className="text-xs tabular-nums text-ink-500">{size} {size === 1 ? 'student' : 'students'}</span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-ink-900" aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card as="section" aria-labelledby="news-heading">
                <CardHeader
                  title="From the school"
                  titleId="news-heading"
                  action={<Link to="/teacher/announcements" className={textLinkClass}>View all</Link>}
                />
                {data.announcements.length === 0 ? (
                  <p className="px-5 py-5 text-sm text-ink-500">No announcements from administrators yet.</p>
                ) : (
                  <ul className="divide-y divide-ink-200">
                    {data.announcements.map((announcement) => (
                      <li key={announcement.id}>
                        <button
                          type="button"
                          onClick={() => setOpenAnnouncement(announcement)}
                          className="block w-full px-5 py-3 text-left transition hover:bg-ink-50 focus-visible:-outline-offset-2"
                        >
                          <span className="flex items-center gap-2 text-xs text-ink-500">
                            <Badge>{announcement.type}</Badge>
                            <time dateTime={announcement.createdAt}>{formatDateTime(announcement.createdAt)}</time>
                          </span>
                          <span className="mt-1.5 block text-sm font-medium text-ink-900">{announcement.title}</span>
                          <span className="mt-0.5 line-clamp-2 text-sm text-ink-500">{announcement.body}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
      <AnnouncementDialog announcement={openAnnouncement} onClose={() => setOpenAnnouncement(null)} />
    </>
  );
}
