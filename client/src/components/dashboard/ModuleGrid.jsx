import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../common/Card.jsx';

/** Shortcuts to each module in a portal, marking the ones still to come. */
export default function ModuleGrid({ items }) {
  return (
    <Card as="ul" className="grid divide-y divide-ink-200 overflow-hidden sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-3">
      {items.map(({ label, to, icon: Icon, phase }) => (
        // Hairlines between cells without doubling up on the card's own border.
        <li key={to} className="sm:-mb-px sm:-mr-px sm:border-b sm:border-r sm:border-ink-200">
          <Link
            to={to}
            className="group flex h-full items-center gap-3 px-4 py-3.5 transition hover:bg-ink-50 focus-visible:-outline-offset-2"
          >
            <Icon className={`size-4 shrink-0 ${phase ? 'text-ink-400' : 'text-ink-600'}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-medium ${phase ? 'text-ink-500' : 'text-ink-900'}`}>{label}</span>
              {phase && <span className="block text-xs text-ink-400">Planned for phase {phase}</span>}
            </span>
            <ArrowRight
              className="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-900"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </Card>
  );
}
