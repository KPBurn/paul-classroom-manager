import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Shortcut cards to each module in a portal, marking the ones still to come. */
export default function ModuleGrid({ items }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ label, to, icon: Icon, phase }) => (
        <li key={to}>
          <Link
            to={to}
            className="group flex h-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-sm"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-slate-900">{label}</span>
              <span className="block text-xs text-slate-500">
                {phase ? `Planned for phase ${phase}` : 'Available'}
              </span>
            </span>
            <ArrowRight
              className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
