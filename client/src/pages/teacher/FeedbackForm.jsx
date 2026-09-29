import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock3, Pencil, School } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import TextField, { TextAreaField } from '../../components/common/TextField.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { feedbackService } from '../../services/feedback.service.js';
import { sessionService } from '../../services/session.service.js';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';

const LONG = 3000;
const savedTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function Card({ number, title, hint, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          {number && (
            <span className="flex size-6 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">{number}</span>
          )}
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
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
  const [saving, setSaving] = useState(null); // 'draft' | 'submit'
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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
      setRoster(lessonRoster);
      setSessions(allSessions);
      const classSubjects = subjects
        .filter((subject) => subject.classroom?.id === lessonRoster.lesson.classroom.id)
        .map((subject) => subject.name);
      setBookSuggestions([...new Set([lessonRoster.suggestedBook, ...classSubjects].filter(Boolean))]);
      setFeedback(existing);
      // Start from the book used last time, or the class's only subject, so it rarely needs typing.
      const defaultBook = lessonRoster.suggestedBook || (classSubjects.length === 1 ? classSubjects[0] : '');
      setValues(existing ? valuesFrom(existing) : { ...EMPTY_FEEDBACK, book: defaultBook });
      setErrors({});
      setDirty(false);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load this feedback.'));
    } finally {
      setLoading(false);
    }
  }, [sessionId, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Warn before leaving the page with unsaved changes.
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
  const viewing = feedback && (!isAuthor || (feedback.status === 'completed' && !editRequested));
  const isCompleted = feedback?.status === 'completed';

  const openStudent = (target, { edit = false } = {}) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    navigate(`/teacher/feedback/lesson/${sessionId}/student/${target.id}${edit ? '?edit=1' : ''}`);
  };
  // The next student down the list who still needs this teacher's feedback, wrapping to the top.
  const nextNeedingFeedback = () => [...students.slice(index + 1), ...students.slice(0, index)]
    .find((item) => item.feedback?.status !== 'completed' && (!item.feedback || item.feedback.teacher.id === user.id));

  const setField = (path, value) => {
    setDirty(true);
    setValues((current) => {
      const [group, key] = path.split('.');
      return key ? { ...current, [group]: { ...current[group], [key]: value } } : { ...current, [group]: value };
    });
    setErrors((current) => {
      if (!current[path]) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
  };

  const save = async (status) => {
    setSaving(status === 'completed' ? 'submit' : 'draft');
    try {
      const saved = feedback
        ? await feedbackService.update(feedback.id, { ...values, status })
        : await feedbackService.create({ sessionId, studentId, ...values, status });
      setFeedback(saved);
      setDirty(false);
      setRoster((current) => ({
        ...current,
        students: current.students.map((item) => (item.id === studentId
          ? { ...item, feedback: { id: saved.id, status: saved.status, teacher: saved.teacher, updatedAt: saved.updatedAt } }
          : item)),
      }));
      return saved;
    } catch (error) {
      const details = error.response?.data?.details;
      if (details?.length) setErrors(Object.fromEntries(details.map((detail) => [detail.field, detail.message])));
      toast.error(getErrorMessage(error, 'Unable to save the feedback.'));
      return null;
    } finally {
      setSaving(null);
    }
  };

  const saveDraft = async () => {
    const saved = await save(isCompleted ? 'completed' : 'draft');
    if (saved) toast.success(isCompleted ? 'Changes saved.' : 'Draft saved.');
  };

  const requestSubmit = () => {
    const missing = missingForSubmit(values);
    setErrors(missing);
    if (Object.keys(missing).length) {
      toast.error('Complete the highlighted sections before submitting.');
      const first = Object.keys(missing)[0];
      document.getElementById(first.startsWith('speaking.') ? 'speaking-section' : `feedback-${first}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setConfirmSubmit(true);
  };

  const submit = async () => {
    const wasCompleted = isCompleted;
    const saved = await save('completed');
    setConfirmSubmit(false);
    if (!saved) return;
    if (wasCompleted) {
      toast.success('Feedback updated.');
      navigate(`/teacher/feedback/lesson/${sessionId}/student/${studentId}`);
      return;
    }
    const next = nextNeedingFeedback();
    toast.success(next ? `Feedback submitted. Next: ${next.name}` : 'Feedback submitted. Every student in this lesson is done.');
    navigate(next ? `/teacher/feedback/lesson/${sessionId}/student/${next.id}` : lessonPath);
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
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

  const studentSwitcher = (
    <div className="flex items-center gap-1.5">
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
      {studentSwitcher}
    </div>
  );

  if (viewing) {
    return (
      <div className="mx-auto max-w-5xl">
        {header}
        <FeedbackView
          feedback={feedback}
          schedule={schedule}
          actions={isAuthor && (
            <Button variant="secondary" className="shrink-0" onClick={() => openStudent(student, { edit: true })}>
              <Pencil className="size-4" aria-hidden="true" /> Edit feedback
            </Button>
          )}
        />
      </div>
    );
  }

  const area = (path, label, { rows = 4, placeholder } = {}) => {
    const [group, key] = path.split('.');
    return (
      <TextAreaField
        id={`feedback-${path}`}
        label={label}
        rows={rows}
        maxLength={LONG}
        count={(key ? values[group][key] : values[group]).length}
        value={key ? values[group][key] : values[group]}
        onChange={(event) => setField(path, event.target.value)}
        placeholder={placeholder}
        error={errors[path]}
      />
    );
  };

  return (
    <div className="mx-auto max-w-5xl pb-24">
      {header}

      <form onSubmit={(event) => event.preventDefault()} noValidate className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{student.name}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.style}`}>{status.label}</span>
            {feedback && (
              <span className="text-xs text-slate-500">
                {isCompleted ? 'Editing submitted feedback' : `Draft saved ${savedTime(feedback.updatedAt)}`}
              </span>
            )}
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
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card number="1" title="What we learned" hint="What was covered in this lesson.">
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
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500" aria-live="polite">
            {dirty ? 'Unsaved changes' : feedback ? `Saved ${savedTime(feedback.updatedAt)}` : 'Not saved yet'}
          </p>
          <div className="flex gap-2">
            {!isCompleted && (
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={saveDraft} isLoading={saving === 'draft'} disabled={Boolean(saving)}>
                Save draft
              </Button>
            )}
            <Button className="flex-1 sm:flex-none" onClick={requestSubmit} isLoading={saving === 'submit'} disabled={Boolean(saving)}>
              {isCompleted ? 'Save changes' : 'Submit feedback'}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title={isCompleted ? `Save changes for ${student.name}?` : `Submit feedback for ${student.name}?`}
        message={isCompleted
          ? 'The submitted feedback will be updated.'
          : 'It will be marked as completed. You can still edit it afterwards.'}
        confirmLabel={isCompleted ? 'Save changes' : 'Submit'}
        isLoading={saving === 'submit'}
        onConfirm={submit}
        onCancel={() => setConfirmSubmit(false)}
      />
    </div>
  );
}
