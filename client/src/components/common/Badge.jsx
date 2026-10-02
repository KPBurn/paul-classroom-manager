/** Status colours. Colour is only used for meaning, so most badges should be `neutral`. */
export const BADGE_TONES = {
  neutral: 'bg-ink-100 text-ink-600',
  info: 'bg-sky-50 text-sky-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
};

/** A small status label. Pass `icon` so the status never relies on colour alone. */
export default function Badge({ tone = 'neutral', icon: Icon, className = '', children, ...props }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium uppercase leading-4 tracking-wider ${BADGE_TONES[tone] ?? BADGE_TONES.neutral} ${className}`}
      {...props}
    >
      {Icon && <Icon className="size-3" aria-hidden="true" />}
      {children}
    </span>
  );
}
