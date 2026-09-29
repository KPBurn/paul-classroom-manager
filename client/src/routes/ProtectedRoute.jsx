import { Navigate, Outlet, useLocation } from 'react-router-dom';
import FullPageSpinner from '../components/common/FullPageSpinner.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { homePathFor } from '../utils/roles.js';

/**
 * Hides pages from users who should not see them. This is a UX convenience
 * only — the API enforces the same rules on every request.
 */
export function ProtectedRoute({ roles, children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;

  return children ?? <Outlet />;
}

/** Keeps signed-in users away from the login page. */
export function GuestRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner />;
  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  return children;
}
