import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { ROLE_LABELS } from '../../utils/roles.js';
import Button, { IconButton } from '../common/Button.jsx';
import Spinner from '../common/Spinner.jsx';

const initials = (user) => `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();

export default function Topbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    setIsSigningOut(true);
    await logout();
    toast.success('You have been signed out.');
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-200 bg-canvas/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <IconButton label="Open navigation" icon={Menu} onClick={onMenuClick} className="-ml-1.5 lg:hidden" />

      <div className="ml-auto flex items-center gap-2">
        <span
          className="flex size-8 items-center justify-center rounded-full bg-ink-200 text-xs font-medium text-ink-700"
          aria-hidden="true"
        >
          {initials(user)}
        </span>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-medium text-ink-900">{user.name}</p>
          <p className="text-xs text-ink-500">{ROLE_LABELS[user.role]}</p>
        </div>
        <span className="mx-1 hidden h-5 w-px bg-ink-200 sm:block" aria-hidden="true" />
        <Button variant="ghost" size="sm" onClick={handleLogout} disabled={isSigningOut} aria-label="Sign out">
          {isSigningOut ? <Spinner className="size-4" /> : <LogOut className="size-4" aria-hidden="true" />}
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
