import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/** The page title style, for pages that build their own header. */
export const pageTitleClass = 'font-display text-[1.75rem] font-medium leading-tight tracking-[-0.02em] text-ink-900';

/** `badges` sit next to the title (for example "Archived"); `actions` are the page's main buttons. */
export default function PageHeader({ title, description, actions, badges }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-ink-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className={pageTitleClass}>{title}</h1>
          {badges}
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** The "back to the list" link above a detail page's title. */
export function BackLink({ to, children }) {
  return (
    <Link to={to} className="mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-500 transition hover:text-ink-900">
      <ArrowLeft className="size-4" aria-hidden="true" /> {children}
    </Link>
  );
}
