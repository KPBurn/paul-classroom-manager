import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import Alert from '../../components/common/Alert.jsx';
import Button, { IconButton } from '../../components/common/Button.jsx';
import Modal from '../../components/common/Modal.jsx';
import TextField, { SelectField } from '../../components/common/TextField.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { getErrorMessage } from '../../utils/errors.js';
import { homePathFor } from '../../utils/roles.js';
import { authService } from '../../services/auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required'),
});

const TEST_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'admin', label: 'Administrator' },
];

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
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverError && <Alert tone="error">{serverError}</Alert>}

        {!roleTestingLoading && roleTestingEnabled && (
          <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div>
              <h2 className="text-sm font-semibold text-amber-900">Temporary role testing is on</h2>
              <p className="mt-1 text-xs leading-5 text-amber-900">
                This test session uses an active account for the selected role and can access its data.
              </p>
            </div>
            <SelectField
              id="test-role"
              label="Test as"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
              options={TEST_ROLES}
            />
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
            <IconButton
              label={showPassword ? 'Hide password' : 'Show password'}
              icon={showPassword ? EyeOff : Eye}
              onClick={() => setShowPassword((shown) => !shown)}
            />
          }
          {...register('password')}
        />

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-ink-600 underline underline-offset-4 hover:text-ink-900">
            Forgot your password?
          </Link>
        </p>
      </form>
      <p className="mt-5 text-center text-xs text-ink-500">
        New student?{' '}
        <Link to="/enroll" className="font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">Apply for enrollment</Link>
        {' '}or{' '}
        <Link to="/enroll/status" className="font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">check your application</Link>.
      </p>
    </Modal>
  );
}
