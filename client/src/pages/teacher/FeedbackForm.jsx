import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock3,
  Copy,
  FilePen,
  Pencil,
  School,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import FeedbackView from '../../components/feedback/FeedbackView.jsx';
import StarRating from '../../components/feedback/StarRating.jsx';
import {
  EMPTY_FEEDBACK,
  FEEDBACK_STATUS,
  formatLessonDate,
  formatTime,
  missingForSubmit,
  schedulePattern,
  SPEAKING_SKILLS,
  valuesFrom,
} from '../../components/feedback/feedbackMeta.js';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import TextField, { TextAreaField } from '../../components/common/TextField.jsx';
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

function StatusIcon({ status }) {
  if (status === 'completed') return <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />;
  if (status === 'draft') return <FilePen className="size-4 shrink-0 text-amber-600" aria-hidden="true" />;
  return <Circle className="size-4 shrink-0 text-slate-300" aria-hidden="true" />;
}

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
      const existing = entry.feedback ? await feedbackService.get(entry.feedback.id) : null;
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

  const submit = async () => {
    const missing = missingForSubmit(values);
    setErrors(missing);
    if (Object.keys(missing).length) {
      toast.error('Complete the highlighted sections before submitting.');
      const first = Object.keys(missing)[0];
      document.getElementById(first.startsWith('speaking.') ? 'speaking-section' : `feedback-${first}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  if (loading && !roster) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (loadError || !roster || !student) {
    return (
      <div className="space-y-3">
        <Link to="/teacher/feedback" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden="true" /> Teacher&apos;s Feedback
        </Link>
        <Alert tone="error">{loadError || 'This feedback could not be found.'}</Alert>
      </div>
    );
  }

  const { lesson } = roster;
  const schedule = schedulePattern(lesson, sessions);
  const status = FEEDBACK_STATUS[feedback?.status ?? 'none'];
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
      <ul className="max-h-[60vh] overflow-y-auto p-1.5">
        {students.map((item) => {
          const current = item.id === studentId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => !current && openStudent(item)}
                aria-current={current ? 'page' : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${current ? 'bg-indigo-50 font-semibold text-indigo-800' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <StatusIcon status={item.feedback?.status} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="sr-only">{FEEDBACK_STATUS[item.feedback?.status ?? 'none'].label}</span>
              </button>
            </li>
          );
        })}
      </ul>
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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Teacher&apos;s Feedback</h1>
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

  const area = (path, label, { rows = 4, placeholder } = {}) => {
    const [group, key] = path.split('.');
    const value = key ? values[group][key] : values[group];
    return (
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
      />
    );
  };

  const saveStatus = {
    saving: 'Saving…',
    error: 'Could not autosave. Use Save draft to try again.',
    saved: feedback ? `Saved ${savedTime(feedback.updatedAt)}` : '',
    idle: '',
  }[saveState] || (dirty ? 'Unsaved changes' : 'Drafts save automatically as you type');

  return layout(
    <div className="pb-28">
      <form onSubmit={(event) => event.preventDefault()} noValidate className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{student.name}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.style}`}>{status.label}</span>
            {isCompleted && <span className="text-xs text-slate-500">Editing submitted feedback</span>}
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
            {area('whatWeLearned', 'Lesson summary', { rows: 6, placeholder: 'e.g. Practised introducing ourselves and answering basic speaking questions.' })}
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
              />
            ))}
          </Card>
        </div>

        <Card title="Teacher evaluation" hint="Be specific, so the student and the next teacher know exactly what to keep doing and what to work on.">
          {area('didWell', '5. What the student did well', { placeholder: 'e.g. Shared ideas confidently and asked good follow-up questions.' })}
          {area('needsImprovement', '6. What needs improvement', { placeholder: 'e.g. Pronunciation of final consonants such as -ed endings.' })}
          {area('recommendation', '7. Recommendation for the next lesson', { placeholder: 'e.g. Continue pronunciation drills and practise longer answers.' })}
        </Card>

        <Card title="Additional notes" hint="Optional. Anything that does not fit above.">
          {area('notes', 'Notes', { rows: 3 })}
        </Card>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${saveState === 'error' ? 'text-red-600' : 'text-slate-500'}`} aria-live="polite">{saveStatus}</p>
          <div className="flex flex-wrap gap-2">
            {skipTarget && (
              <Button variant="ghost" className="!px-3" onClick={() => openStudent(skipTarget)} disabled={submitting} title={`Go to ${skipTarget.name} without submitting`}>
                Skip <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            )}
            {!isCompleted && (
              <Button variant="secondary" onClick={() => saveDraft()} isLoading={saveState === 'saving' && !submitting} disabled={submitting}>
                Save draft
              </Button>
            )}
            <Button className="min-w-0 flex-1 sm:flex-none" onClick={submit} isLoading={submitting}>
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
