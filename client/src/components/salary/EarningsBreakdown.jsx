import { BookOpen, CalendarRange } from 'lucide-react';
import Card, { CardHeader } from '../common/Card.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Tabs from '../common/Tabs.jsx';
import { formatAmount, formatDuration, formatPercent } from '../../utils/format.js';
import { formatTime } from '../../utils/sessionTiming.js';

const GRANULARITIES = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

const formatDay = (value) => new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

/** The heading for one group of earnings, in the grouping the page is set to. */
function bucketLabel({ startedAt, key }, granularity) {
  if (granularity === 'month') return new Date(startedAt).toLocaleDateString([], { month: 'long', year: 'numeric' });
  if (granularity === 'week') {
    return `Week of ${new Date(startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} (${key.slice(-3)})`;
  }
  return formatDay(startedAt);
}

/**
 * A teacher's earnings, grouped by day, week or month, with the classes they
 * were paid for underneath. Shared by the teacher's salary page and the
 * administrator's breakdown of a single teacher.
 */
export default function EarningsBreakdown({ summary, granularity, onGranularityChange }) {
  return (
    <div className="space-y-6">
      <Card as="section" aria-labelledby="earnings-heading">
        <CardHeader
          title="Earnings"
          titleId="earnings-heading"
          icon={CalendarRange}
          action={(
            <Tabs
              label="Group earnings by"
              options={GRANULARITIES}
              value={granularity}
              onChange={onGranularityChange}
              size="sm"
            />
          )}
        />
        {summary.buckets.length === 0 ? (
          <p className="px-5 py-5 text-sm text-ink-500">No class has been taught in this period yet.</p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {summary.buckets.map((bucket) => (
              <li key={bucket.key} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{bucketLabel(bucket, granularity)}</p>
                  <p className="text-xs text-ink-500">
                    {bucket.classes} {bucket.classes === 1 ? 'class' : 'classes'} · {formatDuration(bucket.attendedMs)} in class
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums text-ink-900">{formatAmount(bucket.earnings)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" aria-labelledby="classes-heading">
        <CardHeader title={`Classes (${summary.classes.length})`} titleId="classes-heading" icon={BookOpen} />
        {summary.classes.length === 0 ? (
          <EmptyState
            className="border-0"
            title="No classes in this period"
            message="A class is paid for once it has started and you were in the room."
          />
        ) : (
          <ul className="divide-y divide-ink-200">
            {summary.classes.map((line) => (
              <li key={line.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <p className="text-sm tabular-nums text-ink-900">
                  <span className="block font-medium">{formatDay(line.startsAt)}</span>
                  <span className="block text-xs text-ink-500">{formatTime(line.startsAt)}–{formatTime(line.endsAt)}</span>
                </p>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{line.title}</p>
                  <p className="truncate text-xs text-ink-500">
                    {line.classroom}
                    {' · '}
                    {formatDuration(line.attendedMs)} of {formatDuration(line.durationMs)} attended ({formatPercent(line.share)})
                    {line.rate !== undefined && ` · rate ${formatAmount(line.rate)}`}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums text-ink-900 sm:justify-self-end">
                  {formatAmount(line.amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}