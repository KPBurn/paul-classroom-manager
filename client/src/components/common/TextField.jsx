const inputClass = (error, extra = '') =>
  `block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:ring-2 ${
    error
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-100'
  } ${extra}`;

/** Label row with an optional "12/120" character counter. */
function FieldLabel({ id, label, count, maxLength }) {
  const showCount = count !== undefined && maxLength;
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {showCount && (
        <span className={`text-xs tabular-nums ${count >= maxLength ? 'text-amber-600' : 'text-slate-400'}`}>
          {count}/{maxLength}
        </span>
      )}
    </div>
  );
}

function FieldError({ id, error }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-red-600">
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
      <FieldLabel id={id} label={label} count={count} maxLength={inputProps.maxLength} />
      <div className="relative">
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={inputClass(error, trailing ? 'pr-11' : '')}
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div>}
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
      <FieldLabel id={id} label={label} />
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={inputClass(error, 'pr-8 disabled:bg-slate-50 disabled:text-slate-500')}
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
      <FieldLabel id={id} label={label} count={count} maxLength={textareaProps.maxLength} />
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
