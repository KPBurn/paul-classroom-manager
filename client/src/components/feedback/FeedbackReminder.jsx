import { Bell, ChevronRight, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { textLinkClass } from '../common/Card.jsx';
import { formatShortDate } from './feedbackMeta.js';

const formPath = (item) => `/teacher/feedback/lesson/${item.lesson.id}/student/${item.nextStudent.id}`;
const students = (count) => `${count} ${count === 1 ? 'student' : 'students'}`;
const lessons = (count) => `${count} ${count === 1 ? 'lesson' : 'lessons'}`;

/**
 * Reminds a teacher about unfinished feedback from the last two weeks: a
 * light notice for lessons from the past week, and a stronger alert for
 * lessons that are more than a week old.
 */
export default function FeedbackReminder({ pending, showLink = true }) {
  const { items, summary } = pending;
  if (!summary.students) return null;

  const recentStudents = summary.students - summary.overdueStudents;
  const recentLessons = summary.lessons - summary.overdueLessons;
  const overdue = items.filter((item) => item.overdue);

  return (
    <div className="mb-6 space-y-2">
      {summary.overdueStudents > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
          <div className="flex gap-2.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-amber-900">
                Feedback is overdue for {students(summary.overdueStudents)}
              </h2>
              <p className="mt-0.5 text-sm text-amber-900">
                {lessons(summary.overdueLessons)} from more than a week ago {summary.overdueLessons === 1 ? 'is' : 'are'} still
                missing feedback. Please finish {summary.overdueLessons === 1 ? 'it' : 'them'} soon.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {overdue.slice(0, 4).map((item) => (
                  <li key={item.lesson.id}>
                    <Link
                      to={formPath(item)}
                      className="group flex min-h-9 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm transition hover:border-amber-700"
                    >
                      <span>
                        <span className="font-medium text-ink-900">{item.lesson.classroom.name}</span>
                        <span className="text-ink-500"> · {formatShortDate(item.lesson.startsAt)} · {item.left} left</span>
                      </span>
                      <ChevronRight className="size-4 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-ink-900" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
                {overdue.length > 4 && <li className="self-center text-sm text-amber-900">and {overdue.length - 4} more</li>}
              </ul>
            </div>
          </div>
        </section>
      )}

      {recentStudents > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="status">
          <p className="flex items-start gap-2.5 text-sm text-ink-700">
            <Bell className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden="true" />
            <span>
              <span className="font-medium text-ink-900">Reminder:</span> {students(recentStudents)} from {lessons(recentLessons)} this
              week {recentStudents === 1 ? 'is' : 'are'} waiting for feedback.
            </span>
          </p>
          {showLink && (
            <Link to="/teacher/feedback" className={`${textLinkClass} shrink-0 pl-6.5 sm:pl-0`}>
              Write feedback
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
