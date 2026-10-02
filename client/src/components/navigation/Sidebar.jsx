import { X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import Brand from '../common/Brand.jsx';
import { IconButton } from '../common/Button.jsx';

const linkClass = ({ isActive }) =>
  `group flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
    isActive ? 'bg-ink-200/70 font-medium text-ink-900' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
  }`;

const BADGE_TONES = {
  info: 'bg-ink-900 text-white',
  warning: 'bg-amber-100 text-amber-800',
};

/** `badges` maps a link's path to `{ count, tone, label }` shown next to it. */
export default function Sidebar({ navigation, portalName, badges = {}, open, onClose }) {
  return (
    <>
      {/* Backdrop for the mobile drawer */}
      <div
        className={`fixed inset-0 z-30 bg-ink-900/35 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-200 bg-ink-50 transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <Brand subtitle={portalName} />
          <IconButton label="Close navigation" icon={X} onClick={onClose} className="lg:hidden" />
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
          {navigation.map((section, index) => (
            <div key={section.heading ?? index}>
              {section.heading && (
                <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">
                  {section.heading}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map(({ label, to, icon: Icon, end, phase }) => (
                  <li key={to}>
                    <NavLink to={to} end={end} className={linkClass} onClick={onClose}>
                      <Icon className="size-4 shrink-0 text-ink-500 group-hover:text-ink-900 group-aria-[current=page]:text-ink-900" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {badges[to] && (
                        <span
                          className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-medium leading-4 tabular-nums ${BADGE_TONES[badges[to].tone] ?? BADGE_TONES.info}`}
                          title={badges[to].label}
                        >
                          {badges[to].count > 99 ? '99+' : badges[to].count}
                          <span className="sr-only"> – {badges[to].label}</span>
                        </span>
                      )}
                      {phase && (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
                          Soon
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
