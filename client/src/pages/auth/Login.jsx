import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, GraduationCap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import Modal from '../../components/common/Modal.jsx';
import TextField from '../../components/common/TextField.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { getErrorMessage } from '../../utils/errors.js';
import { homePathFor } from '../../utils/roles.js';
import { authService } from '../../services/auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required'),
});

const devCredentialsAvailable =
  import.meta.env.DEV && import.meta.env.VITE_DEV_LOGIN_EMAIL && import.meta.env.VITE_DEV_LOGIN_PASSWORD;

export default function Login({ onClose }) {
  const { login, loginWithTestRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [roleTestingEnabled, setRoleTestingEnabled] = useState(false);
  const [roleTestingLoading, setRoleTestingLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState('student');
  const [testLoginSubmitting, setTestLoginSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authService.roleTestingStatus()
      .then((enabled) => {
        if (!cancelled) setRoleTestingEnabled(enabled);
      })
      .catch((error) => {
        if (!cancelled) setServerError(getErrorMessage(error, 'Unable to check temporary role testing status.'));
      })
      .finally(() => {
        if (!cancelled) setRoleTestingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: devCredentialsAvailable
      ? {
          email: import.meta.env.VITE_DEV_LOGIN_EMAIL,
          password: import.meta.env.VITE_DEV_LOGIN_PASSWORD,
        }
      : { email: '', password: '' },
  });

  const onSubmit = async (credentials) => {
    setServerError('');
    try {
      const user = await login(credentials);
      toast.success(`Welcome back, ${user.firstName}!`);

      // Return to the page that sent them here, as long as it belongs to their portal.
      const home = homePathFor(user.role);
      const from = location.state?.from?.pathname;
      navigate(from?.startsWith(home) ? from : home, { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error, 'Unable to sign in. Please try again.'));
    }
  };

  const onTestLogin = async () => {
    setServerError('');
    setTestLoginSubmitting(true);
    try {
      const user = await loginWithTestRole(selectedRole);
      toast.success(`Testing as ${user.role}: ${user.firstName}`);
      navigate(homePathFor(user.role), { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error, 'Unable to start a temporary role test session.'));
    } finally {
      setTestLoginSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Welcome back"
      description="Sign in to continue to your classroom."
      size="max-w-md"
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold text-slate-800">Classroom Manager</span>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverError && <Alert tone="error">{serverError}</Alert>}

        {!roleTestingLoading && roleTestingEnabled && (
          <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div>
              <h2 className="text-sm font-semibold text-amber-950">Temporary role testing is on</h2>
              <p className="mt-1 text-xs leading-5 text-amber-900">
                This test session uses an active account for the selected role and can access its data.
              </p>
            </div>
            <label htmlFor="test-role" className="block text-sm font-medium text-slate-700">Test as</label>
            <select
              id="test-role"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Administrator</option>
            </select>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              isLoading={testLoginSubmitting}
              disabled={isSubmitting}
              onClick={onTestLogin}
            >
              Test as {selectedRole === 'admin' ? 'Administrator' : selectedRole}
            </Button>
          </section>
        )}

        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />

        <TextField
          id="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          error={errors.password?.message}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              className="rounded-md p-1.5 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
          {...register('password')}
        />

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-slate-500">
        Accounts are created by your administrator.
      </p>
    </Modal>
  );
}
