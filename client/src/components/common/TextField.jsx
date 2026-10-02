/** The shared look of every text input, select and textarea. */
export const inputClass = (error, extra = '') =>
  `block w-full rounded-lg border bg-white px-3 py-2 text-sm leading-6 text-ink-900 outline-none transition placeholder:text-ink-400 focus:ring-2 disabled:bg-ink-50 disabled:text-ink-500 ${
    error
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-ink-300 hover:border-ink-400 focus:border-accent-500 focus:ring-accent-100'
  } ${extra}`;

/** The shared look of a field label, for controls that are not one of the fields below. */
export const labelClass = 'block text-sm font-medium text-ink-700';

/** Label row with an optional required marker and "12/120" character counter. */
function FieldLabel({ id, label, count, maxLength, required }) {
  const showCount = count !== undefined && maxLength;
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
      </label>
      {showCount && (
        <span className={`text-xs tabular-nums ${count >= maxLength ? 'text-amber-700' : 'text-ink-400'}`}>
          {count}/{maxLength}
        </span>
      )}
    </div>
  );
}

function FieldError({ id, error }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-red-700">
      {error}
    </p>
  );
}

/**
 * Labelled input that shows a validation message. In React 19 `ref` is a
 * regular prop, so React Hook Form's `register()` can be spread onto it.
 * Pass `count` together with `maxLength` to show a character counter.
 */
export default function TextField({ id, label, error, trailing, count, className = '', ...inputProps }) {
  const errorId = `${id}-error`;

  return (
    <div className={className}>
      <FieldLabel id={id} label={label} count={count} maxLength={inputProps.maxLength} required={inputProps.required} />
      <div className="relative">
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={inputClass(error, trailing ? 'pr-11' : '')}
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
      </div>
      <FieldError id={errorId} error={error} />
    </div>
  );
}

/** `options` is a list of `{ value, label }`. */
export function SelectField({ id, label, error, options, className = '', ...selectProps }) {
  const errorId = `${id}-error`;

  return (
    <div className={className}>
      <FieldLabel id={id} label={label} required={selectProps.required} />
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={inputClass(error, 'h-10.5 pr-8')}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={errorId} error={error} />
    </div>
  );
}

export function TextAreaField({ id, label, error, count, className = '', rows = 6, ...textareaProps }) {
  const errorId = `${id}-error`;

  return (
    <div className={className}>
      <FieldLabel id={id} label={label} count={count} maxLength={textareaProps.maxLength} required={textareaProps.required} />
      <textarea
        id={id}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={inputClass(error, 'resize-y')}
        {...textareaProps}
      />
      <FieldError id={errorId} error={error} />
    </div>
  );
}
