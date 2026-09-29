import { LoaderCircle } from 'lucide-react';

export default function Spinner({ className = 'size-5' }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden="true" />;
}
