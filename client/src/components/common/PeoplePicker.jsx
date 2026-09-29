import { useId, useState } from 'react';
import { matchesSearch, SearchInput } from './ListFilters.jsx';

/**
 * A searchable checkbox list for choosing teachers or students. `people`
 * are user objects; `lockedIds` stay selected (for example, yourself).
 */
export default function PeoplePicker({ label, people, selectedIds, onChange, lockedIds = [], emptyMessage, hint }) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const shown = people.filter((person) => matchesSearch(query, person.firstName, person.lastName, person.email));
  const shownIds = shown.map((person) => person.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selectedIds.includes(id));

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
    <fieldset className="min-w-0">
      <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2 text-sm font-medium text-slate-700">
        {label}
        <span className="text-xs font-normal text-slate-500">{selectedIds.length} selected</span>
      </legend>
      <div className="rounded-lg border border-slate-200">
        {people.length > 6 && (
          <div className="flex items-center gap-2 border-b border-slate-100 p-1.5">
            <SearchInput
              id={searchId}
              label={`Search ${label.toLowerCase()}`}
              value={query}
              onChange={setQuery}
              placeholder="Search by name or email"
              className="flex-1"
            />
            {shown.length > 0 && (
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
                  <span className="ml-1.5 text-xs text-slate-400">{person.email}</span>
                </span>
                {locked && <span className="shrink-0 text-xs text-slate-500">You</span>}
              </label>
            );
          })}
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </fieldset>
  );
}
