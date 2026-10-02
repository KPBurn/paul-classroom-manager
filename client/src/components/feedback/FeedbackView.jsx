import { BookOpen, CalendarDays, Clock3, School, UserRound } from 'lucide-react';
import Card from '../common/Card.jsx';
import StarRating from './StarRating.jsx';
import StatusPill from './StatusPill.jsx';
import { formatLessonDate, formatTime, SPEAKING_SKILLS } from './feedbackMeta.js';

const formatDateTime = (value) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function Field({ label, children }) {
  const empty = !children || (typeof children === 'string' && !children.trim());
  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wider text-ink-500">{label}</h4>
      <p className={`mt-1 whitespace-pre-line break-words text-sm leading-relaxed ${empty ? 'text-ink-400' : 'text-ink-800'}`}>
        {empty ? 'Not provided' : children}
      </p>
    </div>
  );
}

function Section({ number, title, children }) {
  return (
    <Card as="section" className="p-5">
      <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-ink-900">
        {number && <span className="font-mono text-xs font-normal text-ink-400">{number.padStart(2, '0')}</span>}
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

/** A read-only teacher feedback record, laid out section by section. */
export default function FeedbackView({ feedback, schedule, actions }) {
  return (
    <div className="space-y-4">
      <Card as="section" className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink-900">{feedback.student.name}</h2>
              <StatusPill status={feedback.status} />
            </div>
            <p className="mt-0.5 text-sm text-ink-500">
              Feedback by {feedback.teacher.name ?? 'Teacher'}
              {feedback.submittedAt
                ? ` · Submitted ${formatDateTime(feedback.submittedAt)}`
                : ` · Last saved ${formatDateTime(feedback.updatedAt)}`}
            </p>
          </div>
          {actions}
        </div>
        <dl className="mt-4 grid gap-3 border-t border-ink-200 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: School, label: 'Class', value: feedback.classroom.name },
            { icon: CalendarDays, label: 'Lesson date', value: formatLessonDate(feedback.session.startsAt) },
            { icon: Clock3, label: 'Time', value: `${formatTime(feedback.session.startsAt)}${schedule ? ` · ${schedule}` : ''}` },
            { icon: BookOpen, label: 'Book / material', value: feedback.book || 'Not provided' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex gap-2">
              <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-xs text-ink-500">{label}</dt>
                <dd className="font-medium text-ink-900">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Card>

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
        <Section title={<span className="flex items-center gap-2"><UserRound className="size-4 text-ink-400" aria-hidden="true" /> Additional notes</span>}>
          <Field label="Notes">{feedback.notes}</Field>
        </Section>
      )}
    </div>
  );
}
