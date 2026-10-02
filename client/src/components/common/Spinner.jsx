import { LoaderCircle } from 'lucide-react';

export default function Spinner({ className = 'size-5' }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden="true" />;
}

/** A centred spinner for a page or section that is still loading. */
export function PageLoader({ label = 'Loading…', className = 'py-16' }) {
  return (
    <div className={`flex justify-center text-ink-400 ${className}`} role="status">
      <Spinner />
      <span className="sr-only">{label}</span>
    </div>
  );
}
