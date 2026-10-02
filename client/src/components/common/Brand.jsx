import { GraduationCap } from 'lucide-react';

/** The product mark and name, used in the sidebar and on the public pages. */
export default function Brand({ subtitle }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-white">
        <GraduationCap className="size-4.5" aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-ink-900">Classroom Manager</span>
        {subtitle && <span className="block text-xs text-ink-500">{subtitle}</span>}
      </span>
    </span>
  );
}
