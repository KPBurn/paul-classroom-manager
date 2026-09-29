import { CircleAlert, Info } from 'lucide-react';

const TONES = {
  error: { icon: CircleAlert, className: 'border-red-200 bg-red-50 text-red-800' },
  info: { icon: Info, className: 'border-indigo-200 bg-indigo-50 text-indigo-900' },
};

export default function Alert({ tone = 'info', children }) {
  const { icon: Icon, className } = TONES[tone];

  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg border p-3 text-sm ${className}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
