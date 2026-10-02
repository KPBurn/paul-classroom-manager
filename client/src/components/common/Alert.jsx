import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import Button from './Button.jsx';

const TONES = {
  error: { icon: CircleAlert, className: 'border-red-200 bg-red-50 text-red-800' },
  warning: { icon: TriangleAlert, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  success: { icon: CircleCheck, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  info: { icon: Info, className: 'border-ink-200 bg-ink-50 text-ink-700' },
};

export default function Alert({ tone = 'info', children }) {
  const { icon: Icon, className } = TONES[tone];

  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${className}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A failed load: the message, and a way to try again. */
export function ErrorState({ message, onRetry, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      <Alert tone="error">{message}</Alert>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
