import { ChevronRight } from 'lucide-react';

/**
 * A row of headline numbers in one bordered strip, instead of a card per number.
 * `stats` is a list of `{ label, value, hint?, emphasis?, onClick? }`; `emphasis`
 * marks a number that needs attention, and `onClick` makes the cell a button.
 */
export default function StatStrip({ stats, columns = 'grid-cols-2 lg:grid-cols-4', label, className = '' }) {
  return (
    // The 1px gaps over a grey background draw the dividers at any column count.
    <dl className={`grid gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 ${columns} ${className}`} aria-label={label}>
      {stats.map(({ label: statLabel, value, hint, emphasis, onClick }) => {
        const content = (
          <>
            <span className="min-w-0 flex-1">
              <dt className="text-xs text-ink-500">{statLabel}</dt>
              <dd>
                <span className={`mt-1 block text-2xl font-medium leading-8 tabular-nums tracking-tight ${emphasis ? 'text-amber-700' : 'text-ink-900'}`}>
                  {value}
                </span>
                {hint && <span className="block truncate text-xs text-ink-500">{hint}</span>}
              </dd>
            </span>
            {onClick && <ChevronRight className="size-4 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-ink-900" aria-hidden="true" />}
          </>
        );
        return onClick ? (
          <button
            key={statLabel}
            type="button"
            onClick={onClick}
            className="group flex items-center gap-3 bg-white px-5 py-4 text-left transition hover:bg-ink-50 focus-visible:-outline-offset-2"
          >
            {content}
          </button>
        ) : (
          <div key={statLabel} className="flex items-center gap-3 bg-white px-5 py-4">{content}</div>
        );
      })}
    </dl>
  );
}

/** A thin progress bar. Pass `label` to expose it to screen readers; otherwise it is decorative. */
export function ProgressBar({ percent, label, className = '' }) {
  const accessibility = label
    ? { role: 'progressbar', 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label }
    : { 'aria-hidden': true };
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-ink-200 ${className}`} {...accessibility}>
      <div
        className={`h-full rounded-full transition-[width] ${percent >= 100 ? 'bg-emerald-600' : 'bg-ink-900'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
