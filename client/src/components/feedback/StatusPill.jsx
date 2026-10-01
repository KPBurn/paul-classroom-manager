import { Circle, CircleCheck, FilePen } from 'lucide-react';
import { FEEDBACK_STATUS } from './feedbackMeta.js';

const ICONS = { none: Circle, draft: FilePen, completed: CircleCheck };

/** Feedback status as an icon plus text, so it never relies on color alone. */
export default function StatusPill({ status, className = '' }) {
  const key = status ?? 'none';
  const Icon = ICONS[key] ?? Circle;
  const { label, style } = FEEDBACK_STATUS[key] ?? FEEDBACK_STATUS.none;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${style} ${className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/** The icon alone, for tight spaces where the label is given separately. */
export function StatusIcon({ status, className = 'size-4' }) {
  const Icon = ICONS[status ?? 'none'] ?? Circle;
  const color = { completed: 'text-emerald-600', draft: 'text-amber-600' }[status] ?? 'text-slate-300';
  return <Icon className={`shrink-0 ${color} ${className}`} aria-hidden="true" />;
}
