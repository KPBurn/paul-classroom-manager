import { BookOpen, CalendarDays, Clock3, School, UserRound } from 'lucide-react';
import StarRating from './StarRating.jsx';
import { FEEDBACK_STATUS, formatLessonDate, formatTime, SPEAKING_SKILLS } from './feedbackMeta.js';

const formatDateTime = (value) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function Field({ label, children }) {
  const empty = !children || (typeof children === 'string' && !children.trim());
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</h4>
      <p className={`mt-1 whitespace-pre-line break-words text-sm leading-relaxed ${empty ? 'text-slate-400' : 'text-slate-800'}`}>
        {empty ? 'Not provided' : children}
      </p>
    </div>
  );
}

function Section({ number, title, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
        {number && (
          <span className="flex size-6 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">{number}</span>
        )}
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** A read-only teacher feedback record, laid out section by section. */
export default function FeedbackView({ feedback, schedule, actions }) {
  const status = FEEDBACK_STATUS[feedback.status] ?? FEEDBACK_STATUS.none;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{feedback.student.name}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.style}`}>{status.label}</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Feedback by {feedback.teacher.name ?? 'Teacher'}
              {feedback.submittedAt
                ? ` · Submitted ${formatDateTime(feedback.submittedAt)}`
                : ` · Last saved ${formatDateTime(feedback.updatedAt)}`}
            </p>
          </div>
          {actions}
        </div>
        <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: School, label: 'Class', value: feedback.classroom.name },
            { icon: CalendarDays, label: 'Lesson date', value: formatLessonDate(feedback.session.startsAt) },
            { icon: Clock3, label: 'Time', value: `${formatTime(feedback.session.startsAt)}${schedule ? ` · ${schedule}` : ''}` },
            { icon: BookOpen, label: 'Book / material', value: feedback.book || 'Not provided' },
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
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section number="1" title="What we learned">
          <Field label="Lesson summary">{feedback.whatWeLearned}</Field>
        </Section>
        <Section number="2" title="Vocabulary">
          <Field label="New words learned">{feedback.vocabulary?.newWords}</Field>
          <Field label="Words the student can use independently">{feedback.vocabulary?.independentWords}</Field>
        </Section>
        <Section number="3" title="Grammar">
          <Field label="Topic">{feedback.grammar?.topic}</Field>
          <Field label="Understanding">{feedback.grammar?.understanding}</Field>
          <Field label="Accuracy">{feedback.grammar?.accuracy}</Field>
        </Section>
        <Section number="4" title="Speaking">
          {SPEAKING_SKILLS.map(({ key, label }) => (
            <StarRating key={key} id={`view-${key}`} label={label} value={feedback.speaking?.[key]} />
          ))}
        </Section>
      </div>
      <Section title="Teacher evaluation">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="5. What the student did well">{feedback.didWell}</Field>
          <Field label="6. What needs improvement">{feedback.needsImprovement}</Field>
          <Field label="7. Recommendation for the next lesson">{feedback.recommendation}</Field>
        </div>
      </Section>
      {feedback.notes && (
        <Section title={<span className="flex items-center gap-2"><UserRound className="size-4 text-slate-400" aria-hidden="true" /> Additional notes</span>}>
          <Field label="Notes">{feedback.notes}</Field>
        </Section>
      )}
    </div>
  );
}
