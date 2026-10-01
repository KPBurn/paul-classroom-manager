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
      <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2 text-sm font-medium text-slate-700">
        <span>
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
        </span>
        <span className="text-xs font-normal text-slate-500">{selectedIds.length} selected</span>
      </legend>
      <div className={`rounded-lg border ${error ? 'border-red-400' : 'border-slate-200'}`}>
        {people.length > 0 && (
          <div className="flex items-center gap-2 border-b border-slate-100 p-1.5">
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
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
              >
                {allShownSelected ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>
        )}
        <div className="max-h-44 overflow-y-auto p-1">
          {people.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-500">{emptyMessage}</p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-500">No one matches “{query}”.</p>
          ) : shown.map((person) => {
            const locked = lockedIds.includes(person.id);
            return (
              <label
                key={person.id}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${locked ? 'text-slate-500' : 'cursor-pointer text-slate-700 hover:bg-slate-50'}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(person.id)}
                  disabled={locked}
                  onChange={() => toggle(person.id)}
                  className="size-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="min-w-0 flex-1 truncate">
                  {person.firstName} {person.lastName}
                  <span className="ml-1.5 text-xs text-slate-500">{person.email}</span>
                </span>
                {locked && <span className="shrink-0 text-xs text-slate-500">You</span>}
              </label>
            );
          })}
        </div>
      </div>
      {selectedPeople.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={`Selected ${label.toLowerCase()}`}>
          {selectedPeople.slice(0, SELECTED_PREVIEW).map((person) => (
            <li key={person.id} className="flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pl-2 pr-1 text-xs text-indigo-800">
              {person.firstName} {person.lastName}
              {!lockedIds.includes(person.id) && (
                <button
                  type="button"
                  onClick={() => toggle(person.id)}
                  className="flex size-5 items-center justify-center rounded-full hover:bg-indigo-100"
                  aria-label={`Remove ${person.firstName} ${person.lastName}`}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
          {selectedPeople.length > SELECTED_PREVIEW && (
            <li className="px-1 py-0.5 text-xs text-slate-500">+{selectedPeople.length - SELECTED_PREVIEW} more</li>
          )}
        </ul>
      )}
      {error && <p id={`${searchId}-error`} className="mt-1.5 text-sm text-red-600">{error}</p>}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </fieldset>
  );
}
