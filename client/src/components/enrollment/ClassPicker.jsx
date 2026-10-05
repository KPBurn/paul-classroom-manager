import { CalendarDays, UserRound } from 'lucide-react';
import { formatSchedule } from '../../utils/schedule.js';

const NO_SUBJECT = 'Other classes';

/** Classes under their subject, subjects in alphabetical order and unlabelled classes last. */
function bySubject(classes) {
  const groups = new Map();
  for (const item of classes) {
    const subject = item.subject || NO_SUBJECT;
    groups.set(subject, [...(groups.get(subject) ?? []), item]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === NO_SUBJECT) - (b === NO_SUBJECT) || a.localeCompare(b));
}

/**
 * Checkbox cards for choosing classes, grouped by subject. Each shows the
 * class, who teaches it and when. `disabledReason(item)` returns why a class
 * cannot be chosen (for example "Already enrolled"), or nothing.
 */
export default function ClassPicker({ classes, selectedIds, onChange, disabledReason = () => undefined, error }) {
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);

  return (
    <div aria-invalid={Boolean(error) || undefined}>
      <div className="space-y-5">
        {bySubject(classes).map(([subject, items]) => (
          <fieldset key={subject}>
            <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-500">{subject}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((item) => {
                const selected = selectedIds.includes(item.id);
                const reason = disabledReason(item);
                return (
                  <label
                    key={item.id}
                    className={`flex gap-3 rounded-xl border p-4 transition ${reason ? 'border-ink-200 bg-ink-50 text-ink-500' : selected ? 'cursor-pointer border-ink-900 bg-ink-50' : 'cursor-pointer border-ink-300 bg-white hover:border-ink-400'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={Boolean(reason)}
                      onChange={() => toggle(item.id)}
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold ${reason ? 'text-ink-500' : 'text-ink-900'}`}>{item.name}</span>
                      <span className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-600">
                        <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                        {formatSchedule(item.schedule)}
                      </span>
                      {item.teachers.length > 0 && (
                        <span className="mt-1 flex items-start gap-1.5 text-xs text-ink-600">
                          <UserRound className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                          {item.teachers.map((teacher) => teacher.name).join(', ')}
                        </span>
                      )}
                      {reason && <span className="mt-1.5 block text-xs font-medium text-ink-500">{reason}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
