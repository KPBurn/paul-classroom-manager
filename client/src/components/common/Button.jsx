import { Link } from 'react-router-dom';
import Spinner from './Spinner.jsx';

const VARIANTS = {
  primary: 'bg-accent-600 text-white hover:bg-accent-500 focus-visible:outline-accent-600',
  secondary: 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-50 focus-visible:outline-accent-600',
  danger: 'bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-accent-600',
  // For dark surfaces (the live class room): `inverse` is the primary action, `dark` the secondary.
  inverse: 'bg-white text-ink-900 hover:bg-ink-200 focus-visible:outline-white',
  dark: 'border border-ink-700 bg-ink-800 text-white hover:bg-ink-700 focus-visible:outline-white',
};

const SIZES = {
  md: 'min-h-10 gap-2 px-4 py-2 text-sm',
  // Compact actions inside rows, toolbars and cards.
  sm: 'min-h-9 gap-1.5 px-3 py-1.5 text-sm',
  // Page-level calls to action on the public pages.
  lg: 'min-h-12 gap-2 px-5 py-3 text-base',
};

/** The shared button look, for elements that are not `<button>` (such as links). */
export const buttonClass = ({ variant = 'primary', size = 'md', className = '' } = {}) =>
  `inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${SIZES[size]} ${VARIANTS[variant]} ${className}`;

export default function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonClass({ variant, size, className })}
      {...props}
    >
      {isLoading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

/** A router link that looks like a button. */
export function ButtonLink({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <Link className={buttonClass({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}

/** A square, icon-only button. `label` is required: it is the accessible name and the tooltip. */
export function IconButton({ label, icon: Icon, tone = 'default', className = '', ...props }) {
  const colors = tone === 'danger' ? 'hover:bg-red-50 hover:text-red-700' : 'hover:bg-ink-100 hover:text-ink-900';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`flex size-8 shrink-0 items-center justify-center rounded-md text-ink-500 transition disabled:opacity-50 ${colors} ${className}`}
      {...props}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
