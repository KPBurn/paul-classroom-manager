import Spinner from './Spinner.jsx';

export default function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-indigo-600" role="status">
      <Spinner className="size-8" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
