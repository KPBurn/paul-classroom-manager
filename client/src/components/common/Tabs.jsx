const SIZES = {
  md: 'min-h-8 px-3.5 py-1 text-sm',
  sm: 'min-h-7 px-3 py-1 text-xs',
};

/** A segmented control for switching between views. `options` is a list of `{ value, label }`. */
export default function Tabs({ label, options, value, onChange, size = 'md', className = '' }) {
  return (
    <div className={`inline-flex rounded-lg bg-ink-100 p-0.5 ${className}`} role="tablist" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-md font-medium transition ${SIZES[size]} ${selected ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
