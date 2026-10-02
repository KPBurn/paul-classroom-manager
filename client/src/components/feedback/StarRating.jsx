import { Star } from 'lucide-react';
import { RATING_LABELS } from './feedbackMeta.js';

/**
 * A 1–5 star rating. Interactive when `onChange` is given; the arrow keys
 * move between stars like a radio group.
 */
export default function StarRating({ id, label, value, onChange, error, required = false }) {
  const readOnly = !onChange;
  const stars = [1, 2, 3, 4, 5];

  if (readOnly) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-28 text-sm font-medium text-ink-700">{label}</span>
        <span className="flex" aria-label={value ? `${value} out of 5` : 'Not rated'}>
          {stars.map((star) => (
            <Star
              key={star}
              className={`size-4 ${value >= star ? 'fill-amber-400 text-amber-400' : 'text-ink-300'}`}
              aria-hidden="true"
            />
          ))}
        </span>
        <span className="text-xs text-ink-500">{value ? `${value}/5 · ${RATING_LABELS[value]}` : 'Not rated'}</span>
      </div>
    );
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        className="flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span id={`${id}-label`} className="w-32 text-sm font-medium text-ink-700">
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
        </span>
        <span className="flex">
          {stars.map((star) => (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} ${star === 1 ? 'star' : 'stars'} – ${RATING_LABELS[star]}`}
              tabIndex={value ? (value === star ? 0 : -1) : (star === 1 ? 0 : -1)}
              title={RATING_LABELS[star]}
              onClick={() => onChange(value === star ? null : star)}
              onKeyDown={(event) => {
                const next = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
                if (!next) return;
                event.preventDefault();
                const rating = Math.min(5, Math.max(1, (value ?? 0) + next));
                onChange(rating);
                event.currentTarget.parentElement.children[rating - 1]?.focus();
              }}
              className="rounded-md p-1.5 transition hover:bg-amber-50"
            >
              <Star
                className={`size-7 ${value >= star ? 'fill-amber-400 text-amber-400' : 'text-ink-300 hover:text-amber-300'}`}
                aria-hidden="true"
              />
            </button>
          ))}
        </span>
        <span className={`text-sm ${value ? 'font-medium text-ink-700' : 'text-ink-500'}`}>
          {value ? `${value}/5 · ${RATING_LABELS[value]}` : 'Not rated'}
        </span>
      </div>
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
