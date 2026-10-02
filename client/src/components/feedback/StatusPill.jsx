import { Circle, CircleCheck, FilePen } from 'lucide-react';
import Badge from '../common/Badge.jsx';
import { FEEDBACK_STATUS } from './feedbackMeta.js';

const ICONS = { none: Circle, draft: FilePen, completed: CircleCheck };

/** Feedback status as an icon plus text, so it never relies on color alone. */
export default function StatusPill({ status, className = '' }) {
  const key = status ?? 'none';
  const { label, tone } = FEEDBACK_STATUS[key] ?? FEEDBACK_STATUS.none;
  return (
    <Badge tone={tone} icon={ICONS[key] ?? Circle} className={className}>
      {label}
    </Badge>
  );
}

/** The icon alone, for tight spaces where the label is given separately. */
export function StatusIcon({ status, className = 'size-4' }) {
  const Icon = ICONS[status ?? 'none'] ?? Circle;
  const color = { completed: 'text-emerald-600', draft: 'text-amber-600' }[status] ?? 'text-ink-300';
  return <Icon className={`shrink-0 ${color} ${className}`} aria-hidden="true" />;
}
