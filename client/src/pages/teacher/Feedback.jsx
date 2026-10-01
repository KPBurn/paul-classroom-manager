import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  FilePen,
  Hourglass,
  MessageSquareText,
  School,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import FeedbackHistory from '../../components/feedback/FeedbackHistory.jsx';
import StatusPill from '../../components/feedback/StatusPill.jsx';
import {
  FEEDBACK_STATUS,
  formatLessonDate,
  formatShortDate,
  formatTime,
  schedulePattern,
} from '../../components/feedback/feedbackMeta.js';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import EmptyState, { Skeleton } from '../../components/common/EmptyState.jsx';
import { matchesSearch, SearchInput } from '../../components/common/ListFilters.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { useFeedbackReminder } from '../../context/FeedbackReminderContext.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { classroomService } from '../../services/classroom.service.js';
import { feedbackService } from '../../services/feedback.service.js';
import { sessionService } from '../../services/session.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { isSameLocalDay } from '../../utils/sessionTiming.js';

const LESSONS_SHOWN = 12;
const QUICK_START_SHOWN = 6;
const sectionHeading = 'text-sm font-semibold uppercase tracking-wider text-slate-500';
const rowButton = 'group flex w-full items-center gap-3 border-l-4 border-transparent px-4 py-3 text-left transition hover:border-indigo-500 hover:bg-indigo-50/60 focus-visible:-outline-offset-2';

export default function TeacherFeedback() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'give';
  const classroomId = params.get('class');
  const lessonId = params.get('lesson');

  const [data, setData] = useState({ classrooms: [], sessions: [], recent: [], draftCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { pending, refresh: refreshReminder } = useFeedbackReminder();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [classrooms, sessions, recent, drafts] = await Promise.all([
        classroomService.list(),
        sessionService.list(),
        feedbackService.list({ limit: 100 }),
        // The draft count is a convenience; the page still works without it.
        feedbackService.list({ status: 'draft', limit: 1 }).catch(() => ({ pagination: { total: 0 } })),
      ]);
      setData({ classrooms, sessions, recent: recent.items, draftCount: drafts.pagination?.total ?? 0 });
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your classes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    refreshReminder();
  }, [load, refreshReminder]);

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

      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Feedback view">
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
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${tab === option.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 space-y-3">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" onClick={load}>Try again</Button>
        </div>
      )}
      {loading ? (
        <div className="space-y-4" role="status" aria-label="Loading feedback">
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-44 rounded-xl" />
        </div>
      ) : error ? null : tab === 'history' ? (
        <FeedbackHistory
          classrooms={data.classrooms}
          basePath="/teacher/feedback"
          initialStatus={params.get('status') ?? ''}
        />
      ) : (
        <>
          {!classroom && (
            <>
              <Overview summary={pending.summary} draftCount={data.draftCount} onDrafts={() => go({ tab: 'history', status: 'draft' })} />
              <QuickStart pending={pending.items} />
              <h2 className={`mb-3 mt-8 ${sectionHeading}`}>Browse by class</h2>
            </>
          )}
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

/** How much feedback is outstanding, at a glance. */
function Overview({ summary, draftCount, onDrafts }) {
  const tiles = [
    {
      label: 'Waiting for feedback',
      value: summary.students,
      hint: summary.students
        ? `${summary.lessons === 1 ? '1 lesson' : `${summary.lessons} lessons`} from the last two weeks`
        : 'Nothing outstanding',
      icon: summary.students ? Hourglass : CircleCheck,
      tone: summary.students ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Overdue',
      value: summary.overdueStudents,
      hint: summary.overdueStudents ? 'From lessons more than a week ago' : 'Nothing older than a week',
      icon: summary.overdueStudents ? TriangleAlert : CircleCheck,
      tone: summary.overdueStudents ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600',
      emphasis: summary.overdueStudents > 0,
    },
    {
      label: 'Drafts',
      value: draftCount,
      hint: draftCount ? 'Saved but not submitted' : 'No unfinished drafts',
      icon: FilePen,
      tone: 'bg-slate-100 text-slate-600',
      onClick: draftCount ? onDrafts : undefined,
    },
  ];
  return (
    <dl className="mb-8 grid gap-3 sm:grid-cols-3">
      {tiles.map(({ label, value, hint, icon: Icon, tone, emphasis, onClick }) => {
        const content = (
          <>
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <dt className="text-sm font-medium text-slate-600">{label}</dt>
              <dd className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-slate-900">{value}</span>
                <span className="truncate text-xs text-slate-500">{hint}</span>
              </dd>
            </span>
            {onClick && <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />}
          </>
        );
        const tileClass = `flex items-center gap-3 rounded-xl border bg-white p-4 text-left shadow-xs ${emphasis ? 'border-amber-300' : 'border-slate-200'}`;
        return onClick ? (
          <button key={label} type="button" onClick={onClick} className={`${tileClass} transition hover:border-indigo-300 hover:shadow-md`}>
            {content}
          </button>
        ) : (
          <div key={label} className={tileClass}>{content}</div>
        );
      })}
    </dl>
  );
}

/** Lessons that still need feedback, each with a button straight to the next student. */
function QuickStart({ pending }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  return (
    <section aria-labelledby="pending-heading">
      <h2 id="pending-heading" className={`mb-3 ${sectionHeading}`}>Continue where you left off</h2>
      {pending.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="You’re all caught up"
          message="Every lesson from the last two weeks has feedback. New lessons appear here once they start."
          className="py-8"
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pending.slice(0, showAll ? pending.length : QUICK_START_SHOWN).map((item) => {
              const left = item.left ?? item.total - item.completed;
              const percent = item.total ? Math.round((item.completed / item.total) * 100) : 0;
              return (
                <li
                  key={item.lesson.id}
                  className={`flex flex-col rounded-xl border bg-white p-4 shadow-xs ${item.overdue ? 'border-amber-300' : 'border-slate-200'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{item.lesson.classroom.name}</p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {isSameLocalDay(item.lesson.startsAt, Date.now()) ? 'Today' : formatShortDate(item.lesson.startsAt)} · {formatTime(item.lesson.startsAt)}
                      </p>
                    </div>
                    {item.overdue && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        <TriangleAlert className="size-3.5" aria-hidden="true" /> Overdue
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600">
                      {item.completed} of {item.total} done
                    </span>
                  </div>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => navigate(`/teacher/feedback/lesson/${item.lesson.id}/student/${item.nextStudent.id}`)}
                  >
                    <span className="truncate">
                      {item.completed || item.drafts ? 'Continue' : 'Start'} with {item.nextStudent.name}
                    </span>
                    <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                  </Button>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    {left} {left === 1 ? 'student' : 'students'} left
                  </p>
                </li>
              );
            })}
          </ul>
          {pending.length > QUICK_START_SHOWN && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((current) => !current)}>
              {showAll ? 'Show fewer' : `Show all ${pending.length} lessons`}
            </Button>
          )}
        </>
      )}
    </section>
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
            title={step.onClick ? `Change ${index === 0 ? 'class' : 'lesson'}` : undefined}
            className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 font-medium transition disabled:cursor-default ${
              index === current
                ? 'bg-indigo-600 text-white'
                : step.done
                  ? 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            {step.done && index !== current ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <span className="text-xs tabular-nums opacity-80">{index + 1}</span>
            )}
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
    return (
      <EmptyState
        icon={School}
        title="No classes assigned yet"
        message="Ask your administrator to assign you to a classroom. Your classes will then appear here."
      />
    );
  }
  return (
    <>
      {classrooms.length > 4 && (
        <SearchInput id="feedback-class-search" label="Search classes" value={query} onChange={setQuery} placeholder="Search classes" className="mb-3 sm:w-72" />
      )}
      {shown.length === 0 ? (
        <EmptyState title={`No classes match “${query}”`} action={<Button variant="secondary" onClick={() => setQuery('')}>Clear search</Button>} />
      ) : (
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
                  className="group flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:border-indigo-300 hover:shadow-md"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-slate-900 group-hover:text-indigo-700">{classroom.name}</span>
                    <ChevronRight className="size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                  <span className="mt-2.5 space-y-1.5 text-sm text-slate-600">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-slate-400" aria-hidden="true" />
                      {latestSeries
                        ? `${schedulePattern(latestSeries, classSessions)} · ${formatTime(latestSeries.startsAt)}`
                        : `${classSessions.length} ${classSessions.length === 1 ? 'lesson' : 'lessons'}`}
                    </span>
                    <span className="flex items-center gap-2">
                      <UsersRound className="size-4 text-slate-400" aria-hidden="true" />
                      {classroom.students?.length ?? 0} students
                    </span>
                    <span className="flex items-center gap-2">
                      <MessageSquareText className="size-4 text-slate-400" aria-hidden="true" />
                      {lastFeedback ? `Last feedback ${formatShortDate(lastFeedback.session.startsAt)}` : 'No feedback yet'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
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
      <EmptyState
        icon={CalendarDays}
        title="No lessons to give feedback on yet"
        message={`Lessons you teach in ${classroom.name} appear here once they start.`}
      />
    );
  }
  return (
    <>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {lessons.slice(0, shownCount).map((lesson) => {
          const done = recent.filter((item) => item.session.id === lesson.id && item.status === 'completed').length;
          const total = lesson.assignments?.students?.length ?? 0;
          const allDone = total > 0 && done >= total;
          return (
            <li key={lesson.id}>
              <button type="button" onClick={() => onSelect(lesson.id)} className={rowButton}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{formatLessonDate(lesson.startsAt)}</span>
                    {isSameLocalDay(lesson.startsAt, now) && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">Today</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-slate-500">
                    {formatTime(lesson.startsAt)} · {lesson.title} · {total} {total === 1 ? 'student' : 'students'}
                  </span>
                </span>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${allDone ? FEEDBACK_STATUS.completed.style : 'bg-slate-100 text-slate-600'}`}>
                  {allDone && <CircleCheck className="size-3.5" aria-hidden="true" />}
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

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'none', label: 'Not started' },
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Completed' },
];

function StudentStep({ lessonId, sessions }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [lessonId, reloadKey]);

  if (error) {
    return (
      <div className="space-y-3">
        <Alert tone="error">{error}</Alert>
        <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Try again</Button>
      </div>
    );
  }
  if (!roster) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading students">
        <Skeleton className="h-20 rounded-xl" />
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  const { lesson, students } = roster;
  const statusOf = (student) => student.feedback?.status ?? 'none';
  const counts = students.reduce((totals, student) => ({ ...totals, [statusOf(student)]: (totals[statusOf(student)] ?? 0) + 1 }), {});
  const completed = counts.completed ?? 0;
  const percent = students.length ? Math.round((completed / students.length) * 100) : 0;
  const shown = students.filter((student) => (!statusFilter || statusOf(student) === statusFilter)
    && matchesSearch(query, student.name, student.email));
  const open = (student) => navigate(`/teacher/feedback/lesson/${lesson.id}/student/${student.id}`);
  const nextStudent = students.find((student) => statusOf(student) !== 'completed'
    && (!student.feedback || student.feedback.teacher.id === user.id));

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs" aria-labelledby="lesson-heading">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="lesson-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <School className="size-5 text-indigo-600" aria-hidden="true" /> {lesson.classroom.name}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {formatLessonDate(lesson.startsAt)} · {formatTime(lesson.startsAt)} · {schedulePattern(lesson, sessions)} · {lesson.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="w-44">
            <p className="text-sm font-medium text-slate-700">
              <span className="tabular-nums">{completed} of {students.length}</span> completed
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Feedback progress">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
          {nextStudent && (
            <Button onClick={() => open(nextStudent)}>
              {completed || counts.draft ? 'Continue' : 'Start'}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {students.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">No students are assigned to this lesson.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center">
            <SearchInput id="feedback-student-search" label="Search students" value={query} onChange={setQuery} placeholder="Search students" className="sm:w-64" />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by feedback status">
              {STATUS_FILTERS.map((option) => {
                const count = option.value ? counts[option.value] ?? 0 : students.length;
                const selected = statusFilter === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setStatusFilter(option.value)}
                    className={`min-h-8 rounded-full px-3 py-1 text-sm font-medium transition ${selected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {option.label} <span className={`tabular-nums ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-900">No students match</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('');
                }}
              >
                Clear search and filter
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((student) => {
                const byOtherTeacher = student.feedback && student.feedback.teacher.id !== user.id;
                const action = !student.feedback ? 'Fill feedback' : byOtherTeacher || student.feedback.status === 'completed' ? 'View' : 'Continue';
                return (
                  <li key={student.id}>
                    <button type="button" onClick={() => open(student)} className={rowButton}>
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700" aria-hidden="true">
                        {student.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900 group-hover:text-indigo-800">{student.name}</span>
                        <span className="block truncate text-sm text-slate-500">
                          {byOtherTeacher ? `Feedback by ${student.feedback.teacher.name}` : student.email}
                        </span>
                      </span>
                      <StatusPill status={student.feedback?.status} />
                      <span
                        className={`hidden min-h-9 w-32 shrink-0 items-center justify-center gap-1 rounded-lg px-3 text-sm font-semibold sm:inline-flex ${
                          action === 'View'
                            ? 'text-slate-700 ring-1 ring-inset ring-slate-300 group-hover:bg-white'
                            : 'bg-indigo-600 text-white group-hover:bg-indigo-500'
                        }`}
                      >
                        {action}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-slate-400 sm:hidden" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
