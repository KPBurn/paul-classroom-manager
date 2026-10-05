import { Link } from 'react-router-dom';
import Brand from '../common/Brand.jsx';
import { ButtonLink } from '../common/Button.jsx';
import { pageTitleClass } from '../common/PageHeader.jsx';

/** The frame of the enrollment pages, which are open to people without an account. */
export default function PublicPage({ title, description, children }) {
  return (
    <div className="min-h-dvh bg-ink-50 text-ink-900">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="rounded-lg">
            <Brand />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <ButtonLink to="/enroll/status" variant="ghost" size="sm">Check status</ButtonLink>
            <ButtonLink to="/login" variant="secondary" size="sm">Sign in</ButtonLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className={pageTitleClass}>{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">{description}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
