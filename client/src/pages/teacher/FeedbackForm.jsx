import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  Clock3,
  Copy,
  History,
  LoaderCircle,
  Pencil,
  School,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import FeedbackView from '../../components/feedback/FeedbackView.jsx';
import StarRating from '../../components/feedback/StarRating.jsx';
import StatusPill, { StatusIcon } from '../../components/feedback/StatusPill.jsx';
import {
  appendPhrase,
  EMPTY_FEEDBACK,
  FEEDBACK_STATUS,
  formatLessonDate,
  formatShortDate,
  formatTime,
  missingForSubmit,
  QUICK_PHRASES,
  REQUIRED_COUNT,
  schedulePattern,
  SPEAKING_SKILLS,
  valuesFrom,
} from '../../components/feedback/feedbackMeta.js';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import { Skeleton } from '../../components/common/EmptyState.jsx';
import { matchesSearch, SearchInput } from '../../components/common/ListFilters.jsx';
import TextField, { TextAreaField } from '../../components/common/TextField.jsx';
import { useFeedbackReminder } from '../../context/FeedbackReminderContext.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { feedbackService } from '../../services/feedback.service.js';
import { sessionService } from '../../services/session.service.js';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';

const LONG = 3000;
const AUTOSAVE_DELAY_MS = 2500;
const savedTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const firstName = (name) => name.split(/\s+/)[0];

/** Lesson details that are usually the same for every student in a class. */
function lessonDetailsFrom(defaults) {
  return {
    whatWeLearned: defaults.whatWeLearned ?? '',
    newWords: defaults.newWords ?? '',
    grammarTopic: defaults.grammarTopic ?? '',
  };
}

function Card({ number, title, hint, action, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            {number && (
              <span className="flex size-6 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">{number}</span>
            )}
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Labels for the fields that must be filled in before submitting, in form order. */
const REQUIRED_LABELS = {
  whatWeLearned: '1. What we learned',
  'speaking.fluency': '4. Speaking: fluency rating',
  'speaking.pronunciation': '4. Speaking: pronunciation rating',
  'speaking.confidence': '4. Speaking: confidence rating',
  didWell: '5. What the student did well',
  needsImprovement: '6. What needs improvement',
  recommendation: '7. Recommendation for the next lesson',
};

export default function FeedbackForm() {
  const { sessionId, studentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const editRequested = searchParams.get('edit') === '1';

  const [roster, setRoster] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [bookSuggestions, setBookSuggestions] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [values, setValues] = useState(EMPTY_FEEDBACK);
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [submitting, setSubmitting] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [previous, setPrevious] = useState(null);
  const [panelQuery, setPanelQuery] = useState('');
  const errorSummaryRef = useRef(null);
  const { refresh: refreshReminder } = useFeedbackReminder();

  // Refs let autosave, switching students and submitting share one save queue without stale state.
  const feedbackRef = useRef(null);
  const valuesRef = useRef(EMPTY_FEEDBACK);
  const versionRef = useRef(0);
  const savingRef = useRef(null);
  // The student on screen; a save that finishes after switching students must not touch the new form.
  const currentStudentRef = useRef(studentId);
  currentStudentRef.current = studentId;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [lessonRoster, allSessions, subjects] = await Promise.all([
        feedbackService.lesson(sessionId),
        sessionService.list(),
        subjectService.list().catch(() => []),
      ]);
      const entry = lessonRoster.students.find((student) => student.id === studentId);
      if (!entry) throw new Error('This student is not part of the lesson.');
      const [existing, history] = await Promise.all([
        entry.feedback ? feedbackService.get(entry.feedback.id) : null,
        // The last thing this teacher told the student, to follow up on. Optional.
        feedbackService.list({ studentId, status: 'completed', limit: 5 }).catch(() => ({ items: [] })),
      ]);
      setPrevious(history.items.find((item) => item.session.id !== sessionId
        && new Date(item.session.startsAt) < new Date(lessonRoster.lesson.startsAt)) ?? null);
      const classSubjects = subjects
        .filter((subject) => subject.classroom?.id === lessonRoster.lesson.classroom.id)
        .map((subject) => subject.name);
      const defaults = lessonRoster.lessonDefaults;
      const reuse = !existing && defaults && defaults.fromStudent.id !== studentId;

      let initial;
      if (existing) {
        initial = valuesFrom(existing);
      } else {
        // Start from the book used last time (or the class's only subject), and from what was
        // taught as written for the previous student, so most of it needs no retyping.
        const shared = reuse ? lessonDetailsFrom(defaults) : { whatWeLearned: '', newWords: '', grammarTopic: '' };
        initial = {
          ...EMPTY_FEEDBACK,
          book: (reuse && defaults.book) || lessonRoster.suggestedBook || (classSubjects.length === 1 ? classSubjects[0] : ''),
          whatWeLearned: shared.whatWeLearned,
          vocabulary: { ...EMPTY_FEEDBACK.vocabulary, newWords: shared.newWords },
          grammar: { ...EMPTY_FEEDBACK.grammar, topic: shared.grammarTopic },
        };
      }

      setRoster(lessonRoster);
      setSessions(allSessions);
      setBookSuggestions([...new Set([lessonRoster.suggestedBook, ...classSubjects].filter(Boolean))]);
      setFeedback(existing);
      feedbackRef.current = existing;
      setValues(initial);
      valuesRef.current = initial;
      versionRef.current = 0;
      setCopiedFrom(reuse && Object.values(lessonDetailsFrom(defaults)).some(Boolean) ? defaults.fromStudent.name : null);
      setErrors({});
      setDirty(false);
      setSaveState(existing ? 'saved' : 'idle');
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load this feedback.'));
    } finally {
      setLoading(false);
    }
  }, [sessionId, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Warn before closing the tab with changes that have not been saved yet.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const students = useMemo(() => roster?.students ?? [], [roster]);
  const index = students.findIndex((student) => student.id === studentId);
  const student = students[index];
  const lessonPath = roster ? `/teacher/feedback?class=${roster.lesson.classroom.id}&lesson=${roster.lesson.id}` : '/teacher/feedback';
  const isAuthor = !feedback || feedback.teacher.id === user.id;
  const viewing = Boolean(feedback) && (!isAuthor || (feedback.status === 'completed' && !editRequested));
  const isCompleted = feedback?.status === 'completed';
  const canAutosave = !viewing && !isCompleted;
  const completedCount = students.filter((item) => item.feedback?.status === 'completed').length;

  // The next student down the list who still needs this teacher's feedback, wrapping to the top.
  const nextNeedingFeedback = (list = students) => {
    const position = list.findIndex((item) => item.id === studentId);
    return [...list.slice(position + 1), ...list.slice(0, position)]
      .find((item) => item.feedback?.status !== 'completed' && (!item.feedback || item.feedback.teacher.id === user.id));
  };
  const nextInList = students.length > 1 ? students[(index + 1) % students.length] : null;

  /** Saves the current values. Calls are queued, so autosave and buttons never create duplicates. */
  const persist = useCallback(async (status) => {
    if (savingRef.current) await savingRef.current.catch(() => {});
    const version = versionRef.current;
    const payload = { ...valuesRef.current, status };
    const run = (async () => {
      const current = feedbackRef.current;
      const saved = current
        ? await feedbackService.update(current.id, payload)
        : await feedbackService.create({ sessionId, studentId, ...payload });
      if (currentStudentRef.current === studentId) {
        feedbackRef.current = saved;
        setFeedback(saved);
        if (versionRef.current === version) setDirty(false);
      }
      setRoster((currentRoster) => currentRoster && ({
        ...currentRoster,
        students: currentRoster.students.map((item) => (item.id === studentId
          ? { ...item, feedback: { id: saved.id, status: saved.status, teacher: saved.teacher, updatedAt: saved.updatedAt } }
          : item)),
      }));
      return saved;
    })();
    savingRef.current = run;
    try {
      return await run;
    } finally {
      if (savingRef.current === run) savingRef.current = null;
    }
  }, [sessionId, studentId]);

  const saveDraft = useCallback(async ({ quiet = false } = {}) => {
    setSaveState('saving');
    try {
      await persist('draft');
      setSaveState('saved');
      if (!quiet) toast.success('Draft saved.');
      return true;
    } catch (error) {
      setSaveState('error');
      if (!quiet) toast.error(getErrorMessage(error, 'Unable to save the draft.'));
      return false;
    }
  }, [persist]);

  // Autosave drafts shortly after the teacher stops typing.
  useEffect(() => {
    if (!dirty || !canAutosave) return undefined;
    const timer = window.setTimeout(() => saveDraft({ quiet: true }), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [values, dirty, canAutosave, saveDraft]);

  const openStudent = async (target, { edit = false } = {}) => {
    if (!target) return;
    if (dirty) {
      // Drafts are saved on the way out; submitted feedback must stay complete, so ask instead.
      const saved = canAutosave ? await saveDraft({ quiet: true }) : false;
      if (!saved && !window.confirm('Your latest changes could not be saved. Leave without saving them?')) return;
    }
    navigate(`/teacher/feedback/lesson/${sessionId}/student/${target.id}${edit ? '?edit=1' : ''}`);
  };

  const setField = (path, value) => {
    versionRef.current += 1;
    setDirty(true);
    setValues((current) => {
      const [group, key] = path.split('.');
      const next = key ? { ...current, [group]: { ...current[group], [key]: value } } : { ...current, [group]: value };
      valuesRef.current = next;
      return next;
    });
    setErrors((current) => {
      if (!current[path]) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
  };

  const applyLessonDetails = (details, { onlyEmpty }) => {
    const fields = [
      ['whatWeLearned', details.whatWeLearned],
      ['vocabulary.newWords', details.newWords],
      ['grammar.topic', details.grammarTopic],
    ];
    for (const [path, value] of fields) {
      const [group, key] = path.split('.');
      const current = key ? valuesRef.current[group][key] : valuesRef.current[group];
      if (!onlyEmpty || !current.trim()) setField(path, value);
    }
  };

  const jumpToField = (key) => {
    const rating = key.startsWith('speaking.');
    const field = document.getElementById(rating ? `speaking-${key.split('.')[1]}-label` : `feedback-${key}`);
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (rating) field?.parentElement?.querySelector('button')?.focus({ preventScroll: true });
    else field?.focus({ preventScroll: true });
  };
  const jumpToFirstMissing = (missing) => jumpToField(Object.keys(missing)[0]);

  const submit = async () => {
    if (submitting) return;
    const missing = missingForSubmit(values);
    setErrors(missing);
    if (Object.keys(missing).length) {
      // Move focus to the summary so keyboard and screen reader users learn what is missing.
      window.requestAnimationFrame(() => {
        errorSummaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        errorSummaryRef.current?.focus({ preventScroll: true });
      });
      return;
    }
    const wasCompleted = isCompleted;
    setSubmitting(true);
    try {
      const saved = await persist('completed');
      setSaveState('saved');
      if (wasCompleted) {
        toast.success('Feedback updated.');
        navigate(`/teacher/feedback/lesson/${sessionId}/student/${studentId}`);
        return;
      }
      const updatedList = students.map((item) => (item.id === studentId
        ? { ...item, feedback: { id: saved.id, status: 'completed', teacher: saved.teacher } }
        : item));
      const next = nextNeedingFeedback(updatedList);
      refreshReminder();
      toast.success(next ? `${student.name} done. Next: ${next.name}` : 'All feedback for this lesson is done.');
      navigate(next ? `/teacher/feedback/lesson/${sessionId}/student/${next.id}` : lessonPath);
    } catch (error) {
      const details = error.response?.data?.details;
      if (details?.length) setErrors(Object.fromEntries(details.map((detail) => [detail.field, detail.message])));
      toast.error(getErrorMessage(error, 'Unable to submit the feedback.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Ctrl/Cmd+S saves a draft and Ctrl/Cmd+Enter submits, from anywhere in the form.
  const shortcutsRef = useRef({});
  shortcutsRef.current = { submit, saveDraft, enabled: !viewing && !loading, canSaveDraft: canAutosave };
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const { submit: runSubmit, saveDraft: runSaveDraft, enabled, canSaveDraft } = shortcutsRef.current;
      if (!enabled) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canSaveDraft) runSaveDraft();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (loading && !roster) {
    return (
      <div className="mx-auto max-w-7xl" role="status" aria-label="Loading feedback form">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-3 h-8 w-80 max-w-full" />
        <div className="mt-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
          <Skeleton className="hidden h-64 rounded-xl lg:block" />
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }
  if (loadError || !roster || !student) {
    return (
      <div className="space-y-3">
        <Link to="/teacher/feedback" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden="true" /> Teacher&apos;s Feedback
        </Link>
        <Alert tone="error">{loadError || 'This feedback could not be found.'}</Alert>
        <Button variant="secondary" onClick={load}>Try again</Button>
      </div>
    );
  }

  const { lesson } = roster;
  const schedule = schedulePattern(lesson, sessions);
  const defaults = roster.lessonDefaults;
  const canCopy = !viewing && !isCompleted && defaults && defaults.fromStudent.id !== studentId && !copiedFrom;
  const nextStudent = nextNeedingFeedback();
  // Skip leaves this student for later and moves on to whoever still needs feedback.
  const skipTarget = nextStudent ?? nextInList;

  const studentPanel = (
    <nav aria-label="Students in this lesson" className="sticky top-4 hidden self-start rounded-xl border border-slate-200 bg-white shadow-xs lg:block">
      <div className="border-b border-slate-100 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Students</p>
        <p className="mt-0.5 text-sm text-slate-700">{completedCount} / {students.length} completed</p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${students.length ? (completedCount / students.length) * 100 : 0}%` }} />
        </div>
      </div>
      {students.length > 8 && (
        <div className="border-b border-slate-100 p-1.5">
          <SearchInput id="feedback-panel-search" label="Search students" value={panelQuery} onChange={setPanelQuery} placeholder="Search students" />
        </div>
      )}
      <ul className="max-h-[55vh] overflow-y-auto p-1.5">
        {students.filter((item) => item.id === studentId || matchesSearch(panelQuery, item.name)).map((item) => {
          const current = item.id === studentId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => !current && openStudent(item)}
                aria-current={current ? 'page' : undefined}
                title={`${item.name}: ${FEEDBACK_STATUS[item.feedback?.status ?? 'none'].label}`}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${current ? 'bg-indigo-50 font-semibold text-indigo-800' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <StatusIcon status={item.feedback?.status} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="sr-only">{FEEDBACK_STATUS[item.feedback?.status ?? 'none'].label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><StatusIcon status="completed" className="size-3.5" /> Done</span>
        <span className="inline-flex items-center gap-1"><StatusIcon status="draft" className="size-3.5" /> Draft</span>
        <span className="inline-flex items-center gap-1"><StatusIcon status="none" className="size-3.5" /> Not started</span>
      </p>
    </nav>
  );

  const compactSwitcher = (
    <div className="flex items-center gap-1.5 lg:hidden">
      <button
        type="button"
        onClick={() => openStudent(students[index - 1])}
        disabled={index <= 0}
        className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        aria-label="Previous student"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <label htmlFor="feedback-student" className="sr-only">Student</label>
      <select
        id="feedback-student"
        value={studentId}
        onChange={(event) => openStudent(students.find((item) => item.id === event.target.value))}
        className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-sm font-medium text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-64 sm:flex-none"
      >
        {students.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} — {FEEDBACK_STATUS[item.feedback?.status ?? 'none'].label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => openStudent(students[index + 1])}
        disabled={index >= students.length - 1}
        className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        aria-label="Next student"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );

  const header = (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link to={lessonPath} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden="true" /> {lesson.classroom.name} · {formatLessonDate(lesson.startsAt)}
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight text-slate-900">
          <span className="min-w-0 wrap-break-word">Feedback for {student.name}</span>
          <StatusPill status={feedback?.status} />
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {lesson.classroom.name} · {formatTime(lesson.startsAt)} · Student {index + 1} of {students.length}
        </p>
      </div>
      {compactSwitcher}
    </div>
  );

  const layout = (content) => (
    <div className="mx-auto max-w-7xl">
      {header}
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        {studentPanel}
        <div className={`min-w-0 transition-opacity ${loading ? 'pointer-events-none opacity-50' : ''}`} aria-busy={loading}>
          {content}
        </div>
      </div>
    </div>
  );

  if (viewing) {
    return layout(
      <FeedbackView
        feedback={feedback}
        schedule={schedule}
        actions={(
          <div className="flex shrink-0 flex-wrap gap-2">
            {isAuthor && (
              <Button variant="secondary" onClick={() => openStudent(student, { edit: true })}>
                <Pencil className="size-4" aria-hidden="true" /> Edit
              </Button>
            )}
            {nextStudent && (
              <Button onClick={() => openStudent(nextStudent)}>
                Next: {firstName(nextStudent.name)} <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      />,
    );
  }

  const area = (path, label, { rows = 4, placeholder, phrases, required = false } = {}) => {
    const [group, key] = path.split('.');
    const value = key ? values[group][key] : values[group];
    const unused = phrases?.filter((phrase) => !value.toLowerCase().includes(phrase.toLowerCase()));
    return (
      <div>
        <TextAreaField
          id={`feedback-${path}`}
          label={label}
          rows={rows}
          maxLength={LONG}
          count={value.length}
          value={value}
          onChange={(event) => setField(path, event.target.value)}
          placeholder={placeholder}
          error={errors[path]}
          required={required}
        />
        {unused?.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`Quick phrases for ${label}`}>
            <span className="text-xs text-slate-500">Quick add:</span>
            {unused.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => setField(path, appendPhrase(value, phrase).slice(0, LONG))}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
              >
                + {phrase}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const missingNow = missingForSubmit(values);
  const requiredDone = REQUIRED_COUNT - Object.keys(missingNow).length;

  // One clear save state at a time: saving, failed, unsaved, saved, or the autosave hint.
  const saveIndicator = saveState === 'saving'
    ? { icon: LoaderCircle, text: 'Saving…', style: 'text-slate-600', spin: true }
    : saveState === 'error'
      ? { icon: CircleAlert, text: 'Could not save your changes.', style: 'text-red-600', retry: true }
      : dirty
        ? { icon: Circle, text: 'Unsaved changes', style: 'text-slate-600' }
        : feedback
          ? { icon: CircleCheck, text: `Saved ${savedTime(feedback.updatedAt)}`, style: 'text-emerald-700' }
          : { icon: null, text: isCompleted ? '' : 'Drafts save automatically as you type', style: 'text-slate-500' };
  const errorKeys = Object.keys(REQUIRED_LABELS).filter((key) => errors[key]);

  return layout(
    <div className="pb-32 sm:pb-28">
      <form onSubmit={(event) => event.preventDefault()} noValidate className="space-y-4">
        {errorKeys.length > 0 && (
          <div
            ref={errorSummaryRef}
            tabIndex={-1}
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <h2 className="flex items-center gap-2 font-semibold text-red-900">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              {errorKeys.length === 1 ? '1 section still needs' : `${errorKeys.length} sections still need`} to be filled in before you can submit
            </h2>
            <ul className="mt-2 space-y-1 pl-7 text-sm">
              {errorKeys.map((key) => (
                <li key={key}>
                  <button type="button" onClick={() => jumpToField(key)} className="rounded text-left font-medium text-red-800 underline underline-offset-2 hover:text-red-950">
                    {REQUIRED_LABELS[key]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Lesson details</h2>
            <p className="text-sm text-slate-500">
              {isCompleted ? 'You are editing submitted feedback.' : <><span className="text-red-600" aria-hidden="true">*</span> Required to submit</>}
            </p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {[
              { icon: School, label: 'Class', value: lesson.classroom.name },
              { icon: CalendarDays, label: 'Lesson date', value: formatLessonDate(lesson.startsAt) },
              { icon: Clock3, label: 'Time · schedule', value: `${formatTime(lesson.startsAt)} · ${schedule}` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex gap-2">
                <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="font-medium text-slate-800">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
            <BookOpen className="mt-2 size-4 shrink-0 text-slate-400" aria-hidden="true" />
            <TextField
              id="feedback-book"
              label="Book / material"
              list="feedback-books"
              maxLength={200}
              value={values.book}
              onChange={(event) => setField('book', event.target.value)}
              placeholder="e.g. Get Ready for IELTS"
              className="min-w-0 flex-1 sm:max-w-xl [&_input]:py-1.5 [&_label]:text-xs [&_label]:font-normal [&_label]:text-slate-500"
            />
            <datalist id="feedback-books">
              {bookSuggestions.map((book) => <option key={book} value={book} />)}
            </datalist>
          </div>
          {previous && (
            <details className="group mt-4 rounded-lg border border-slate-200 bg-slate-50/70">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
                <History className="size-4 text-slate-400" aria-hidden="true" />
                Last lesson’s feedback · {formatShortDate(previous.session.startsAt)}
                <ChevronRight className="ml-auto size-4 text-slate-400 transition group-open:rotate-90" aria-hidden="true" />
              </summary>
              <dl className="grid gap-3 border-t border-slate-200 px-3 py-3 text-sm sm:grid-cols-2">
                {[
                  ['Needed improvement', previous.needsImprovement],
                  ['Recommended for this lesson', previous.recommendation],
                ].map(([term, text]) => (
                  <div key={term}>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{term}</dt>
                    <dd className="mt-0.5 whitespace-pre-line text-slate-700">{text || 'Not provided'}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {copiedFrom && (
            <div className="mt-4 flex flex-col gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-sm text-indigo-900 sm:flex-row sm:items-center sm:justify-between">
              <p>
                <Copy className="mr-1.5 inline size-4 align-[-3px]" aria-hidden="true" />
                Lesson summary, new words and grammar topic were copied from {copiedFrom}&apos;s feedback. Edit anything that differs.
              </p>
              <button
                type="button"
                onClick={() => {
                  applyLessonDetails({ whatWeLearned: '', newWords: '', grammarTopic: '' }, { onlyEmpty: false });
                  setCopiedFrom(null);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Undo
              </button>
            </div>
          )}
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            number="1"
            title="What we learned"
            hint="What was covered in this lesson."
            action={canCopy && (
              <button
                type="button"
                onClick={() => {
                  applyLessonDetails(lessonDetailsFrom(defaults), { onlyEmpty: true });
                  toast.success(`Filled empty lesson details from ${defaults.fromStudent.name}.`);
                }}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                <Copy className="size-3.5" aria-hidden="true" /> Copy from {firstName(defaults.fromStudent.name)}
              </button>
            )}
          >
            {area('whatWeLearned', 'Lesson summary', { required: true, rows: 6, placeholder: 'e.g. Practised introducing ourselves and answering basic speaking questions.' })}
          </Card>
          <Card number="2" title="Vocabulary">
            {area('vocabulary.newWords', 'New words learned', { rows: 3, placeholder: 'confident, pronunciation, introduction…' })}
            {area('vocabulary.independentWords', 'Words the student can use independently', { rows: 3 })}
          </Card>
        </div>

        <Card number="3" title="Grammar">
          <TextField
            id="feedback-grammar.topic"
            label="Topic"
            maxLength={200}
            value={values.grammar.topic}
            onChange={(event) => setField('grammar.topic', event.target.value)}
            placeholder="e.g. Getting to Know You"
          />
          <div className="grid gap-4 md:grid-cols-2">
            {area('grammar.understanding', 'Understanding', { rows: 3, placeholder: 'How well the student understood the topic.' })}
            {area('grammar.accuracy', 'Accuracy', { rows: 3, placeholder: 'How accurately the student used it.' })}
          </div>
        </Card>

        <div id="speaking-section">
          <Card number="4" title="Speaking" hint="Click a star to rate from 1 to 5. Click it again to clear.">
            {SPEAKING_SKILLS.map(({ key, label }) => (
              <StarRating
                key={key}
                id={`speaking-${key}`}
                label={label}
                value={values.speaking[key]}
                onChange={(rating) => setField(`speaking.${key}`, rating)}
                error={errors[`speaking.${key}`]}
                required
              />
            ))}
          </Card>
        </div>

        <Card title="Teacher evaluation" hint="Be specific, so the student and the next teacher know exactly what to keep doing and what to work on.">
          {area('didWell', '5. What the student did well', { required: true, placeholder: 'e.g. Shared ideas confidently and asked good follow-up questions.', phrases: QUICK_PHRASES.didWell })}
          {area('needsImprovement', '6. What needs improvement', { required: true, placeholder: 'e.g. Pronunciation of final consonants such as -ed endings.', phrases: QUICK_PHRASES.needsImprovement })}
          {area('recommendation', '7. Recommendation for the next lesson', { required: true, placeholder: 'e.g. Continue pronunciation drills and practise longer answers.', phrases: QUICK_PHRASES.recommendation })}
        </Card>

        <Card title="Additional notes" hint="Optional. Anything that does not fit above.">
          {area('notes', 'Notes', { rows: 3 })}
        </Card>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {requiredDone === REQUIRED_COUNT ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <CircleCheck className="size-3.5" aria-hidden="true" /> Ready to submit
              </span>
            ) : (
              <button
                type="button"
                onClick={() => jumpToFirstMissing(missingNow)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                title="Go to the next section that still needs filling in"
              >
                Required: {requiredDone} of {REQUIRED_COUNT} done
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </button>
            )}
            <p className={`flex items-center gap-1.5 text-sm font-medium ${saveIndicator.style}`} aria-live="polite">
              {saveIndicator.icon && (
                <saveIndicator.icon className={`size-4 shrink-0 ${saveIndicator.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
              )}
              {saveIndicator.text}
              {saveIndicator.retry && (
                <button type="button" onClick={() => saveDraft()} className="rounded font-semibold underline underline-offset-2 hover:text-red-800">
                  Try again
                </button>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {skipTarget && (
              <Button variant="ghost" className="!px-3" onClick={() => openStudent(skipTarget)} disabled={submitting} title={`Go to ${skipTarget.name} without submitting`}>
                Skip <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            )}
            {!isCompleted && (
              <Button variant="secondary" onClick={() => saveDraft()} isLoading={saveState === 'saving' && !submitting} disabled={submitting} title="Save draft (Ctrl+S)">
                Save draft
              </Button>
            )}
            <Button className="min-w-0 flex-1 sm:flex-none" onClick={submit} isLoading={submitting} title="Submit (Ctrl+Enter)">
              <span className="truncate">
                {isCompleted
                  ? 'Save changes'
                  : nextStudent ? `Submit & next: ${firstName(nextStudent.name)}` : 'Submit feedback'}
              </span>
              {!isCompleted && nextStudent && <ChevronRight className="size-4 shrink-0" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
  );
}
