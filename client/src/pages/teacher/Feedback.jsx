import { CalendarDays, Check, ChevronRight, FilePen, MessageSquareText, School, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import FeedbackHistory from '../../components/feedback/FeedbackHistory.jsx';
import {
  FEEDBACK_STATUS,
  formatLessonDate,
  formatShortDate,
  formatTime,
  schedulePattern,
} from '../../components/feedback/feedbackMeta.js';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import { ListToolbar, matchesSearch, SearchInput } from '../../components/common/ListFilters.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { classroomService } from '../../services/classroom.service.js';
import { feedbackService } from '../../services/feedback.service.js';
import { sessionService } from '../../services/session.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { isSameLocalDay } from '../../utils/sessionTiming.js';

const LESSONS_SHOWN = 12;

export default function TeacherFeedback() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'give';
  const classroomId = params.get('class');
  const lessonId = params.get('lesson');

  const [data, setData] = useState({ classrooms: [], sessions: [], recent: [], pending: [], drafts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [classrooms, sessions, recent, pending, drafts] = await Promise.all([
        classroomService.list(),
        sessionService.list(),
        feedbackService.list({ limit: 100 }),
        feedbackService.pending(),
        feedbackService.list({ status: 'draft', limit: 5 }),
      ]);
      setData({ classrooms, sessions, recent: recent.items, pending, drafts: drafts.items });
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your classes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const go = (next) => {
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) nextParams.set(key, value);
    setParams(nextParams);
  };
  const classroom = data.classrooms.find((item) => item.id === classroomId);
  // Lessons taught by this teacher, so feedback always goes to their own students.
  const myLessons = data.sessions.filter((session) => session.status !== 'cancelled'
    && session.assignments?.teachers?.some((teacher) => teacher.id === user.id));

  return (
    <>
      <PageHeader
        title="Teacher's Feedback"
        description="Write individual feedback for each student after a lesson, and review what you have written."
      />

      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Feedback view">
        {[
          { value: 'give', label: 'Give feedback' },
          { value: 'history', label: 'History' },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            onClick={() => go(option.value === 'history' ? { tab: 'history' } : { class: classroomId, lesson: lessonId })}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === option.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : tab === 'history' ? (
        <FeedbackHistory classrooms={data.classrooms} basePath="/teacher/feedback" />
      ) : (
        <>
          {!classroom && <QuickStart pending={data.pending} drafts={data.drafts} />}
          <Steps
            classroom={classroom}
            lesson={lessonId ? myLessons.find((session) => session.id === lessonId) : null}
            onClass={() => go({})}
            onLesson={() => go({ class: classroomId })}
          />
          {!classroom ? (
            <ClassStep classrooms={data.classrooms} sessions={myLessons} recent={data.recent} onSelect={(id) => go({ class: id })} />
          ) : !lessonId ? (
            <LessonStep classroom={classroom} sessions={myLessons} recent={data.recent} onSelect={(id) => go({ class: classroomId, lesson: id })} />
          ) : (
            <StudentStep lessonId={lessonId} sessions={data.sessions} />
          )}
        </>
      )}
    </>
  );
}

/** Shortcuts straight to the next student for recent lessons, and to unfinished drafts. */
function QuickStart({ pending, drafts }) {
  const navigate = useNavigate();
  const openForm = (lessonId, studentId) => navigate(`/teacher/feedback/lesson/${lessonId}/student/${studentId}`);
  if (!pending.length && !drafts.length) return null;

  return (
    <div className="mb-6 space-y-4">
      {drafts.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4" aria-labelledby="drafts-heading">
          <h2 id="drafts-heading" className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <FilePen className="size-4" aria-hidden="true" />
            You have {drafts.length === 5 ? '5 or more' : drafts.length} unfinished {drafts.length === 1 ? 'draft' : 'drafts'}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <button
                  type="button"
                  onClick={() => openForm(draft.session.id, draft.student.id)}
                  className="group flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm shadow-xs transition hover:border-amber-400"
                >
                  <span>
                    <span className="block font-medium text-slate-900">{draft.student.name}</span>
                    <span className="block text-xs text-slate-500">{draft.classroom.name} · {formatShortDate(draft.session.startsAt)}</span>
                  </span>
                  <span className="ml-2 text-xs font-semibold text-amber-800 group-hover:text-amber-900">Continue →</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Needs feedback</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pending.map((item) => {
              const left = item.total - item.completed;
              const percent = item.total ? Math.round((item.completed / item.total) * 100) : 0;
              return (
                <li key={item.lesson.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{item.lesson.classroom.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {isSameLocalDay(item.lesson.startsAt, Date.now()) ? 'Today' : formatShortDate(item.lesson.startsAt)} · {formatTime(item.lesson.startsAt)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {left} of {item.total} left
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
                  </div>
                  <Button className="mt-3 w-full !py-2" onClick={() => openForm(item.lesson.id, item.nextStudent.id)}>
                    {item.completed || item.drafts ? 'Continue' : 'Start'} with {item.nextStudent.name}
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Steps({ classroom, lesson, onClass, onLesson }) {
  const steps = [
    { label: classroom ? classroom.name : 'Choose a class', done: Boolean(classroom), onClick: classroom ? onClass : undefined },
    { label: lesson ? formatShortDate(lesson.startsAt) : 'Choose a lesson', done: Boolean(lesson), onClick: lesson ? onLesson : undefined },
    { label: 'Students', done: false },
  ];
  const current = !classroom ? 0 : !lesson ? 1 : 2;
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Feedback steps">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-1.5">
          {index > 0 && <ChevronRight className="size-4 text-slate-300" aria-hidden="true" />}
          <button
            type="button"
            onClick={step.onClick}
            disabled={!step.onClick}
            aria-current={index === current ? 'step' : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition ${
              index === current
                ? 'bg-indigo-600 text-white'
                : step.done
                  ? 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            {step.done && index !== current && <Check className="size-3.5" aria-hidden="true" />}
            <span className="max-w-48 truncate">{step.label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function ClassStep({ classrooms, sessions, recent, onSelect }) {
  const [query, setQuery] = useState('');
  const shown = classrooms.filter((classroom) => matchesSearch(query, classroom.name));

  if (!classrooms.length) {
    return <Alert>No classrooms are assigned to you yet. Ask your administrator to assign you to a class.</Alert>;
  }
  return (
    <>
      {classrooms.length > 4 && (
        <ListToolbar count={shown.length} noun="class">
          <SearchInput id="feedback-class-search" label="Search classes" value={query} onChange={setQuery} placeholder="Search classes" className="sm:w-72" />
        </ListToolbar>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((classroom) => {
          const classSessions = sessions.filter((session) => session.classroom?.id === classroom.id);
          const latestSeries = [...classSessions].reverse().find((session) => session.seriesId);
          const lastFeedback = recent.find((item) => item.classroom.id === classroom.id);
          return (
            <li key={classroom.id}>
              <button
                type="button"
                onClick={() => onSelect(classroom.id)}
                className="group flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-slate-900 group-hover:text-indigo-700">{classroom.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="mt-2 space-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    {latestSeries
                      ? `${schedulePattern(latestSeries, classSessions)} · ${formatTime(latestSeries.startsAt)}`
                      : `${classSessions.length} ${classSessions.length === 1 ? 'lesson' : 'lessons'}`}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <UsersRound className="size-3.5" aria-hidden="true" />
                    {classroom.students?.length ?? 0} students
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageSquareText className="size-3.5" aria-hidden="true" />
                    {lastFeedback ? `Last feedback ${formatShortDate(lastFeedback.session.startsAt)}` : 'No feedback yet'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function LessonStep({ classroom, sessions, recent, onSelect }) {
  const [shownCount, setShownCount] = useState(LESSONS_SHOWN);
  const now = Date.now();
  // Feedback follows a lesson, so list lessons that have started (plus the rest of today).
  const lessons = sessions
    .filter((session) => session.classroom?.id === classroom.id
      && (new Date(session.startsAt).getTime() <= now || isSameLocalDay(session.startsAt, now)))
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));

  if (!lessons.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <CalendarDays className="mx-auto size-7 text-slate-400" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-slate-900">No lessons to give feedback on yet</p>
        <p className="mt-1 text-sm text-slate-500">Lessons you teach in {classroom.name} appear here once they start.</p>
      </div>
    );
  }
  return (
    <>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-xs">
        {lessons.slice(0, shownCount).map((lesson) => {
          const done = recent.filter((item) => item.session.id === lesson.id && item.status === 'completed').length;
          const total = lesson.assignments?.students?.length ?? 0;
          return (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => onSelect(lesson.id)}
                className="group flex w-full items-center gap-3 border-l-4 border-transparent px-4 py-3 text-left transition hover:border-indigo-500 hover:bg-indigo-50/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{formatLessonDate(lesson.startsAt)}</span>
                    {isSameLocalDay(lesson.startsAt, now) && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">Today</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {formatTime(lesson.startsAt)} · {lesson.title} · {total} {total === 1 ? 'student' : 'students'}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${done && done >= total ? FEEDBACK_STATUS.completed.style : 'bg-slate-100 text-slate-600'}`}>
                  {done}/{total} done
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {lessons.length > shownCount && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={() => setShownCount((count) => count + LESSONS_SHOWN)}>Show older lessons</Button>
        </div>
      )}
    </>
  );
}

function StudentStep({ lessonId, sessions }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRoster(null);
    setError('');
    feedbackService.lesson(lessonId)
      .then((result) => {
        if (!cancelled) setRoster(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError, 'Unable to load this lesson.'));
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!roster) return <div className="flex justify-center py-12"><Spinner /></div>;

  const { lesson, students } = roster;
  const completed = students.filter((student) => student.feedback?.status === 'completed').length;
  const percent = students.length ? Math.round((completed / students.length) * 100) : 0;
  const open = (student) => navigate(`/teacher/feedback/lesson/${lesson.id}/student/${student.id}`);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <School className="size-4 text-indigo-600" aria-hidden="true" /> {lesson.classroom.name}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {formatLessonDate(lesson.startsAt)} · {formatTime(lesson.startsAt)} · {schedulePattern(lesson, sessions)} · {lesson.title}
          </p>
        </div>
        <div className="sm:w-56">
          <p className="text-sm font-medium text-slate-700">{completed} / {students.length} students completed</p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Feedback progress">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
      {students.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">No students are assigned to this lesson.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {students.map((student) => {
            const status = FEEDBACK_STATUS[student.feedback?.status ?? 'none'];
            const byOtherTeacher = student.feedback && student.feedback.teacher.id !== user.id;
            const action = !student.feedback ? 'Fill feedback' : byOtherTeacher || student.feedback.status === 'completed' ? 'View' : 'Continue';
            return (
              <li key={student.id}>
                <button
                  type="button"
                  onClick={() => open(student)}
                  className="group flex w-full items-center gap-3 border-l-4 border-transparent px-4 py-3 text-left transition hover:border-indigo-500 hover:bg-indigo-50/60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                    {student.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-indigo-800">{student.name}</span>
                    {byOtherTeacher && <span className="block text-xs text-slate-500">By {student.feedback.teacher.name}</span>}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.style}`}>{status.label}</span>
                  <span className={`hidden w-28 shrink-0 text-right text-sm font-medium sm:block ${action === 'View' ? 'text-slate-600' : 'text-indigo-700'}`}>
                    {action}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        Past feedback is in <Link to="/teacher/feedback?tab=history" className="font-medium text-indigo-700 hover:text-indigo-800">History</Link>.
      </p>
    </section>
  );
}
