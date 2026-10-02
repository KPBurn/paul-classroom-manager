/** The one surface style: white, hairline border, no shadow. */
export const cardClass = 'rounded-xl border border-ink-200 bg-white';

export default function Card({ as: Tag = 'div', className = '', children, ...props }) {
  return (
    <Tag className={`${cardClass} ${className}`} {...props}>
      {children}
    </Tag>
  );
}

/** A card's title row, with an optional action (usually a link) on the right. */
export function CardHeader({ title, titleId, icon: Icon, action, className = '' }) {
  return (
    <div className={`flex min-h-12 items-center justify-between gap-3 border-b border-ink-200 px-5 py-2.5 ${className}`}>
      <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        {Icon && <Icon className="size-4 text-ink-400" aria-hidden="true" />}
        {title}
      </h2>
      {action}
    </div>
  );
}

/** The small uppercase label above a group of content. */
export function SectionLabel({ as: Tag = 'h2', className = '', children, ...props }) {
  return (
    <Tag className={`text-xs font-medium uppercase tracking-wider text-ink-500 ${className}`} {...props}>
      {children}
    </Tag>
  );
}

/** Inline text link, used for "View all" style actions. */
export const textLinkClass = 'rounded-sm text-sm font-medium text-ink-600 underline decoration-ink-300 underline-offset-4 transition hover:text-ink-900 hover:decoration-ink-900';
