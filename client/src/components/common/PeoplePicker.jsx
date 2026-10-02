import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { matchesSearch, SearchInput } from './ListFilters.jsx';

const SELECTED_PREVIEW = 8;

/**
 * A searchable checkbox list for choosing teachers or students. `people`
 * are user objects; `lockedIds` stay selected (for example, yourself).
 */
export default function PeoplePicker({ label, people, selectedIds, onChange, lockedIds = [], emptyMessage, hint, name, required = false, error }) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const shown = people.filter((person) => matchesSearch(query, person.firstName, person.lastName, person.email));
  const shownIds = shown.map((person) => person.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selectedIds.includes(id));
  const selectedPeople = people.filter((person) => selectedIds.includes(person.id));

  const toggle = (id) => {
    if (lockedIds.includes(id)) return;
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  };
  const toggleShown = () => {
    onChange(allShownSelected
      ? selectedIds.filter((id) => !shownIds.includes(id) || lockedIds.includes(id))
      : [...new Set([...selectedIds, ...shownIds])]);
  };

  return (
    <fieldset className="min-w-0" data-picker={name} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${searchId}-error` : undefined}>
      <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2 text-sm font-medium text-ink-700">
        <span>
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
        </span>
        <span className="text-xs font-normal text-ink-500">{selectedIds.length} selected</span>
      </legend>
      <div className={`rounded-lg border bg-white ${error ? 'border-red-400' : 'border-ink-300'}`}>
        {people.length > 0 && (
          <div className="flex items-center gap-2 border-b border-ink-200 p-1.5">
            <SearchInput
              id={searchId}
              label={`Search ${label.toLowerCase()}`}
              value={query}
              onChange={setQuery}
              placeholder="Search by name or email"
              className="flex-1"
            />
            {shown.length > 1 && (
              <button
                type="button"
                onClick={toggleShown}
                className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              >
                {allShownSelected ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>
        )}
        <div className="max-h-44 overflow-y-auto p-1">
          {people.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-500">{emptyMessage}</p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-500">No one matches “{query}”.</p>
          ) : shown.map((person) => {
            const locked = lockedIds.includes(person.id);
            return (
              <label
                key={person.id}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${locked ? 'text-ink-500' : 'cursor-pointer text-ink-700 hover:bg-ink-50'}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(person.id)}
                  disabled={locked}
                  onChange={() => toggle(person.id)}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">
                  {person.firstName} {person.lastName}
                  <span className="ml-1.5 text-xs text-ink-500">{person.email}</span>
                </span>
                {locked && <span className="shrink-0 text-xs text-ink-500">You</span>}
              </label>
            );
          })}
        </div>
      </div>
      {selectedPeople.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={`Selected ${label.toLowerCase()}`}>
          {selectedPeople.slice(0, SELECTED_PREVIEW).map((person) => (
            <li key={person.id} className="flex items-center gap-1 rounded-md bg-ink-100 py-0.5 pl-2 pr-0.5 text-xs text-ink-700">
              {person.firstName} {person.lastName}
              {!lockedIds.includes(person.id) && (
                <button
                  type="button"
                  onClick={() => toggle(person.id)}
                  className="flex size-5 items-center justify-center rounded-sm text-ink-500 hover:bg-ink-200 hover:text-ink-900"
                  aria-label={`Remove ${person.firstName} ${person.lastName}`}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
          {selectedPeople.length > SELECTED_PREVIEW && (
            <li className="px-1 py-0.5 text-xs text-ink-500">+{selectedPeople.length - SELECTED_PREVIEW} more</li>
          )}
        </ul>
      )}
      {error && <p id={`${searchId}-error`} className="mt-1.5 text-sm text-red-700">{error}</p>}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </fieldset>
  );
}
