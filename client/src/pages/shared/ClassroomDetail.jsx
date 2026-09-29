import { ArrowLeft, CalendarClock, Plus, School, UsersRound, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AnnouncementFeed from '../../components/announcements/AnnouncementFeed.jsx';
import AnnouncementFormModal from '../../components/announcements/AnnouncementFormModal.jsx';
import { useAnnouncementActions } from '../../components/announcements/useAnnouncementActions.jsx';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useAnnouncements } from '../../hooks/useAnnouncements.js';
import { useNow } from '../../hooks/useNow.js';
import { classroomService } from '../../services/classroom.service.js';
import { sessionService } from '../../services/session.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import {
  formatTime,
  isJoinable,
  isSameLocalDay,
  PHASE_LABELS,
  PHASE_STYLES,
  sessionPhase,
} from '../../utils/sessionTiming.js';
import { classroomSize, classroomTeachers, personName } from './MyClassrooms.jsx';

const PAGE_SIZE = 10;
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

  const loader = useCallback((params) => classroomService.announcements(id, params), [id]);
  const announcements = useAnnouncements(PAGE_SIZE, { status, loader });
  const actions = useAnnouncementActions(announcements.reload);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedClassroom, allSessions] = await Promise.all([
        classroomService.get(id),
        sessionService.list(isStudent ? { view: 'mine' } : {}),
      ]);
      setClassroom(loadedClassroom);
      setSessions(allSessions.filter((session) => session.classroom?.id === id));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load this classroom.'));
    } finally {
      setLoading(false);
    }
  }, [id, isStudent]);

  useEffect(() => {
    load();
  }, [load]);

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

  const backLink = (
    <Link
      to={`/${user.role}/classrooms`}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> My Classrooms
    </Link>
  );

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !classroom) {
    return (
      <>
        {backLink}
        <div className="space-y-3">
          <Alert tone="error">{error || 'Classroom not found.'}</Alert>
          <Button variant="secondary" onClick={load}>Try again</Button>
        </div>
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

  return (
    <>
      {backLink}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{classroom.name}</h1>
            {classroom.openAccess && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Open classroom</span>
            )}
            {classroom.archived && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Archived</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {teachers.map(personName).join(', ')} · {size} {size === 1 ? 'student' : 'students'}
          </p>
        </div>
        {canManage && !classroom.archived && (
          <Button onClick={() => setIsPostOpen(true)} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" /> Post announcement
          </Button>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2" aria-labelledby="class-announcements">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="class-announcements" className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Class announcements
            </h2>
            {canManage && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs" role="tablist" aria-label="Announcement status">
                {['active', 'archived'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={status === option}
                    onClick={() => setStatus(option)}
                    className={`rounded-md px-3 py-1 font-medium capitalize transition ${status === option ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
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
              <Button className="mt-5" onClick={() => setIsPostOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> Post announcement
              </Button>
            )}
          />
        </section>

        {/* On small screens the aside's cards join the page flow so upcoming sessions (and Join) come first. */}
        <aside className="contents lg:block lg:space-y-6">
          <section className="order-first rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:order-none" aria-labelledby="class-sessions">
            <h2 id="class-sessions" className="flex items-center gap-2 font-semibold text-slate-900">
              <CalendarClock className="size-4 text-indigo-600" aria-hidden="true" /> Upcoming sessions
            </h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No upcoming sessions are scheduled for this class.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {upcoming.map((session) => {
                  const joinNow = session.phase === 'live' || session.phase === 'soon';
                  return (
                    <li key={session.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{session.title}</p>
                        <p className="text-xs text-slate-500">
                          {isSameLocalDay(session.startsAt, now) ? 'Today' : formatDay(session.startsAt)} · {formatTime(session.startsAt)}–{formatTime(session.endsAt)}
                        </p>
                        {session.phase !== 'upcoming' && (
                          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${PHASE_STYLES[session.phase]}`}>
                            {PHASE_LABELS[session.phase]}
                          </span>
                        )}
                      </div>
                      {(joinNow || (canManage && session.phase === 'closed')) && (
                        <Button
                          className="!px-3 !py-2 shrink-0"
                          variant={session.phase === 'live' ? 'primary' : 'secondary'}
                          onClick={() => navigate(`/sessions/${session.id}/room`)}
                        >
                          <Video className="size-4" aria-hidden="true" /> Join
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="class-people">
            <h2 id="class-people" className="flex items-center gap-2 font-semibold text-slate-900">
              <UsersRound className="size-4 text-indigo-600" aria-hidden="true" /> Class list
            </h2>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {teachers.length > 1 ? 'Teachers' : 'Teacher'}
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {teachers.map((teacher) => (
                <li key={teacher.id} className="flex items-center gap-2">
                  <School className="size-3.5 text-slate-400" aria-hidden="true" /> {personName(teacher)}
                </li>
              ))}
            </ul>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Students ({size})
            </h3>
            {isStudent ? (
              <p className="mt-2 text-sm text-slate-600">
                You and {Math.max(0, size - 1)} {size - 1 === 1 ? 'classmate' : 'classmates'}.
              </p>
            ) : classroom.students?.length ? (
              <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-sm text-slate-700">
                {classroom.students.map((student) => (
                  <li key={student.id} className="truncate">{personName(student)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No students are enrolled yet.</p>
            )}
          </section>
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
