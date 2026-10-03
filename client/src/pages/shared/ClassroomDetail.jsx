import { CalendarClock, Play, Plus, UsersRound, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import AnnouncementFeed from '../../components/announcements/AnnouncementFeed.jsx';
import AnnouncementFormModal from '../../components/announcements/AnnouncementFormModal.jsx';
import { useAnnouncementActions } from '../../components/announcements/useAnnouncementActions.jsx';
import ClassroomMaterials from '../../components/materials/ClassroomMaterials.jsx';
import { ErrorState } from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card, { CardHeader, SectionLabel } from '../../components/common/Card.jsx';
import PageHeader, { BackLink } from '../../components/common/PageHeader.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import Tabs from '../../components/common/Tabs.jsx';
import RoomPresence, { LiveStatusNote } from '../../components/sessions/RoomPresence.jsx';
import { useLiveSessionList, useSessionEvents } from '../../context/LiveSessionsContext.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useAnnouncements } from '../../hooks/useAnnouncements.js';
import { useNow } from '../../hooks/useNow.js';
import { classroomService } from '../../services/classroom.service.js';
import { sessionService } from '../../services/session.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { periodParams } from '../../utils/period.js';
import {
  formatTime,
  isJoinable,
  isSameLocalDay,
  PHASE_LABELS,
  PHASE_TONES,
  sessionPhase,
} from '../../utils/sessionTiming.js';
import { classroomSize, classroomTeachers, personName } from './MyClassrooms.jsx';

const PAGE_SIZE = 10;
const STATUS_TABS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];
const UPCOMING_LIMIT = 5;
const formatDay = (value) => new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

export default function ClassroomDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const canManage = !isStudent;
  const now = useNow();

  const [classroom, setClassroom] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('active');
  const [isPostOpen, setIsPostOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const [isStarting, setIsStarting] = useState(false);

  const loader = useCallback((params) => classroomService.announcements(id, params), [id]);
  const announcements = useAnnouncements(PAGE_SIZE, { status, loader });
  const actions = useAnnouncementActions(announcements.reload);

  const inThisClass = useCallback((session) => session.classroom?.id === id, [id]);
  // Only this class's sessions that are still to come.
  const loadSessions = useCallback(async () => (
    await sessionService.list({ ...(isStudent && { view: 'mine' }), classroomId: id, ...periodParams(new Date()) })
  ).filter(inThisClass), [id, isStudent, inThisClass]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedClassroom, classSessions] = await Promise.all([classroomService.get(id), loadSessions()]);
      setClassroom(loadedClassroom);
      setSessions(classSessions);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load this classroom.'));
    } finally {
      setLoading(false);
    }
  }, [id, loadSessions]);

  useEffect(() => {
    load();
  }, [load]);

  // A class starting or ending shows here as it happens; a changed schedule asks for the sessions again.
  const reloadSessions = useCallback((change) => {
    if (change && change.classroomId !== id) return;
    // A failed quiet refresh leaves the list as it was; the next event or visit tries again.
    loadSessions().then(setSessions).catch(() => {});
  }, [id, loadSessions]);
  useLiveSessionList({ setSessions, reload: reloadSessions, accept: inThisClass });
  // Teachers are told who comes and goes while they are on their class page.
  useSessionEvents((type, payload) => {
    const change = type === 'presence' && payload.classroomId === id ? payload.change : null;
    if (!change?.name || change.userId === user.id) return;
    toast(`${change.name} ${change.type === 'joined' ? 'joined' : 'left'} the class.`, { id: `presence-${change.userId}` });
  });

  const startSession = async () => {
    setIsStarting(true);
    try {
      const { session } = await sessionService.startNow(id);
      navigate(`/sessions/${session.id}/room`);
    } catch (startError) {
      toast.error(getErrorMessage(startError, 'Unable to start the session.'));
      setIsStarting(false);
    }
  };

  const post = async (values) => {
    setIsPosting(true);
    try {
      await classroomService.postAnnouncement(id, values);
      toast.success('Announcement posted to the class.');
      setIsPostOpen(false);
      if (status !== 'active') setStatus('active');
      else if (announcements.page === 1) announcements.reload();
      else announcements.setPage(1);
    } catch (postError) {
      toast.error(getErrorMessage(postError, 'Unable to post the announcement.'));
    } finally {
      setIsPosting(false);
    }
  };

  const backLink = <BackLink to={`/${user.role}/classrooms`}>My Classrooms</BackLink>;

  if (loading) return <PageLoader label="Loading classroom…" />;
  if (error || !classroom) {
    return (
      <>
        {backLink}
        <ErrorState message={error || 'Classroom not found.'} onRetry={load} />
      </>
    );
  }

  const teachers = classroomTeachers(classroom);
  const size = classroomSize(classroom);
  const upcoming = sessions
    .map((session) => ({ ...session, phase: sessionPhase(session, now) }))
    .filter((session) => isJoinable(session.phase) || session.phase === 'closed')
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    .slice(0, UPCOMING_LIMIT);
  const hasLiveSession = upcoming.some((session) => session.phase === 'live');
  const canStart = canManage && !classroom.archived && !hasLiveSession;

  return (
    <>
      {backLink}
      <PageHeader
        title={classroom.name}
        description={`${teachers.map(personName).join(', ')} · ${size} ${size === 1 ? 'student' : 'students'}`}
        badges={(classroom.openAccess || classroom.archived) && (
          <>
            {classroom.openAccess && <Badge tone="warning">Open classroom</Badge>}
            {classroom.archived && <Badge>Archived</Badge>}
          </>
        )}
        actions={canManage && !classroom.archived && (
          <Button onClick={() => setIsPostOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> Post announcement
          </Button>
        )}
      />

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-10 lg:col-span-2">
        <section aria-labelledby="class-announcements">
          <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-3">
            <SectionLabel id="class-announcements">Class announcements</SectionLabel>
            {canManage && (
              <Tabs label="Announcement status" options={STATUS_TABS} value={status} onChange={setStatus} size="sm" />
            )}
          </div>
          <AnnouncementFeed
            list={announcements}
            renderActions={canManage ? actions.renderActions : undefined}
            emptyTitle={status === 'archived' ? 'No archived announcements' : 'No announcements yet'}
            emptyMessage={status === 'archived'
              ? 'Archived announcements are hidden from students and can be restored.'
              : canManage
                ? 'Post reminders, homework and updates here. Students in this class will see them.'
                : 'Your teacher has not posted anything for this class yet.'}
            emptyAction={canManage && status === 'active' && !classroom.archived && (
              <Button onClick={() => setIsPostOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> Post announcement
              </Button>
            )}
          />
        </section>

        <ClassroomMaterials classroomId={id} canManage={canManage} archived={classroom.archived} />
        </div>

        {/* On small screens the aside's cards join the page flow so upcoming sessions (and Join) come first. */}
        <aside className="contents lg:block lg:space-y-6">
          <Card as="section" className="order-first lg:order-0" aria-labelledby="class-sessions">
            <CardHeader
              title="Sessions"
              titleId="class-sessions"
              icon={CalendarClock}
              action={canStart && (
                <Button size="sm" onClick={startSession} isLoading={isStarting}>
                  {!isStarting && <Play className="size-4" aria-hidden="true" />} Start session
                </Button>
              )}
            />
            <LiveStatusNote className="border-b border-ink-200 px-5 py-2" />
            {upcoming.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-500">
                {canStart
                  ? 'Nothing is scheduled. Start a session now, or plan one from the Schedule page.'
                  : isStudent
                    ? 'No session is live or scheduled. This page updates when your teacher starts one.'
                    : 'No upcoming sessions are scheduled for this class.'}
              </p>
            ) : (
              <ul className="divide-y divide-ink-200">
                {upcoming.map((session) => {
                  const joinNow = session.phase === 'live' || session.phase === 'soon';
                  return (
                    <li key={session.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">{session.title}</p>
                        <p className="text-xs tabular-nums text-ink-500">
                          {isSameLocalDay(session.startsAt, now) ? 'Today' : formatDay(session.startsAt)} · {formatTime(session.startsAt)}–{formatTime(session.endsAt)}
                        </p>
                        {session.phase !== 'upcoming' && (
                          <Badge tone={PHASE_TONES[session.phase]} className="mt-1.5">{PHASE_LABELS[session.phase]}</Badge>
                        )}
                        {session.phase !== 'closed' && (
                          <RoomPresence sessionId={session.id} always={session.phase === 'live'} className="mt-1.5" />
                        )}
                      </div>
                      {(joinNow || (canManage && session.phase === 'closed')) && (
                        <Button
                          size="sm"
                          className="shrink-0"
                          variant={session.phase === 'live' ? 'primary' : 'secondary'}
                          onClick={() => navigate(`/sessions/${session.id}/room`)}
                        >
                          <Video className="size-4" aria-hidden="true" /> {session.phase === 'soon' ? 'Join early' : 'Join'}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card as="section" aria-labelledby="class-people">
            <CardHeader title="Class list" titleId="class-people" icon={UsersRound} />
            <div className="px-5 py-4">
              <SectionLabel as="h3">{teachers.length > 1 ? 'Teachers' : 'Teacher'}</SectionLabel>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-900">
                {teachers.map((teacher) => (
                  <li key={teacher.id} className="truncate">{personName(teacher)}</li>
                ))}
              </ul>
              <SectionLabel as="h3" className="mt-5 tabular-nums">Students ({size})</SectionLabel>
              {isStudent ? (
                <p className="mt-2 text-sm text-ink-700">
                  You and {Math.max(0, size - 1)} {size - 1 === 1 ? 'classmate' : 'classmates'}.
                </p>
              ) : classroom.students?.length ? (
                <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-sm text-ink-900">
                  {classroom.students.map((student) => (
                    <li key={student.id} className="truncate">{personName(student)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-500">No students are enrolled yet.</p>
              )}
            </div>
          </Card>
        </aside>
      </div>

      <AnnouncementFormModal
        open={isPostOpen}
        onClose={() => setIsPostOpen(false)}
        onSubmit={post}
        title="Post Class Announcement"
        description={`Students in ${classroom.name} will see this on their class page.`}
        submitLabel="Post"
        isSaving={isPosting}
      />
      {actions.dialogs}
    </>
  );
}
