/** A friendly placeholder for lists with nothing to show, with an optional action. */
export default function EmptyState({ icon: Icon, title, message, action, className = '' }) {
  return (
    <div className={`rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center ${className}`}>
      {Icon && (
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Grey placeholder bars shown while a list or form is loading. */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} aria-hidden="true" />;
}
