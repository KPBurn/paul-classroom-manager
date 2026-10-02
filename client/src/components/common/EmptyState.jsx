/** A placeholder for lists with nothing to show, with an optional action. */
export default function EmptyState({ icon: Icon, title, message, action, className = '' }) {
  return (
    <div className={`rounded-xl border border-dashed border-ink-300 px-6 py-12 text-center ${className}`}>
      {Icon && <Icon className="mx-auto size-6 text-ink-400" aria-hidden="true" />}
      <p className="mt-3 text-sm font-medium text-ink-900">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{message}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Grey placeholder bars shown while a list or form is loading. */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-ink-100 ${className}`} aria-hidden="true" />;
}
