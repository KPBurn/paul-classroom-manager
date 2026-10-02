import { ButtonLink } from '../../components/common/Button.jsx';
import { pageTitleClass } from '../../components/common/PageHeader.jsx';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-sm text-ink-500">404</p>
      <h1 className={`mt-2 ${pageTitleClass}`}>Page not found</h1>
      <p className="mt-2 text-sm text-ink-500">The page you are looking for does not exist.</p>
      <ButtonLink to="/" className="mt-6">
        Go to dashboard
      </ButtonLink>
    </div>
  );
}
