import { GraduationCap, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const linkClass = ({ isActive }) =>
  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
  }`;

const BADGE_TONES = {
  info: 'bg-indigo-500 text-white',
  warning: 'bg-amber-400 text-amber-950',
};

/** `badges` maps a link's path to `{ count, tone, label }` shown next to it. */
export default function Sidebar({ navigation, portalName, badges = {}, open, onClose }) {
  return (
    <>
      {/* Backdrop for the mobile drawer */}
      <div
        className={`fixed inset-0 z-30 bg-slate-900/50 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <GraduationCap className="size-5" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Classroom Manager</p>
              <p className="text-xs text-slate-400">{portalName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {navigation.map((section, index) => (
            <div key={section.heading ?? index}>
              {section.heading && (
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {section.heading}
                </p>
              )}
              <ul className="space-y-1">
                {section.items.map(({ label, to, icon: Icon, end, phase }) => (
                  <li key={to}>
                    <NavLink to={to} end={end} className={linkClass} onClick={onClose}>
                      <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{label}</span>
                      {badges[to] && (
                        <span
                          className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none ${BADGE_TONES[badges[to].tone] ?? BADGE_TONES.info}`}
                          title={badges[to].label}
                        >
                          {badges[to].count > 99 ? '99+' : badges[to].count}
                          <span className="sr-only"> – {badges[to].label}</span>
                        </span>
                      )}
                      {phase && (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 group-hover:bg-slate-700">
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
