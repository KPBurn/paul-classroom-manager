import { Search, X } from 'lucide-react';

/** The compact (36px) control used in toolbars, for search boxes, selects and date pickers. */
export const controlClass = 'h-9 rounded-lg border border-ink-300 bg-white text-sm text-ink-900 outline-none transition hover:border-ink-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-100';

/** A compact search box with a clear button, for filtering lists. */
export function SearchInput({ id, label, value, onChange, placeholder, className = '', ...inputProps }) {
  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={`${controlClass} w-full pl-9 pr-8 placeholder:text-ink-400 [&::-webkit-search-cancel-button]:hidden`}
        {...inputProps}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          aria-label={`Clear ${label.toLowerCase()}`}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** A compact labelled select for list filters. `options` is a list of `{ value, label }`. */
export function FilterSelect({ id, label, value, onChange, options, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${controlClass} w-full pl-3 pr-8`}
        title={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

/** The row that holds a list's search and filters, plus a result count. */
export function ListToolbar({ children, count, noun }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
      {count !== undefined && (
        <p className="text-xs tabular-nums text-ink-500 sm:ml-auto" aria-live="polite">
          {count} {count === 1 ? noun : `${noun}s`}
        </p>
      )}
    </div>
  );
}

/** Matches a search query against several text fields, ignoring case and extra spaces. */
export function matchesSearch(query, ...fields) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fields.flat().filter(Boolean).join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
