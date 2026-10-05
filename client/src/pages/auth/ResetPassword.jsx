import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import Button, { ButtonLink } from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import TextField from '../../components/common/TextField.jsx';
import PublicPage from '../../components/enrollment/PublicPage.jsx';
import { authService } from '../../services/auth.service.js';
import { getErrorMessage } from '../../utils/errors.js';

// Keep in sync with passwordSchema in server/src/validators/auth.validators.js.
function passwordProblem(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 72) return 'Password must be at most 72 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain a letter and a number.';
  return undefined;
}

/** Where an emailed reset link lands: choose the new password. */
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problems, setProblems] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const found = {
      ...(passwordProblem(password) && { password: passwordProblem(password) }),
      ...(confirm !== password && { confirm: 'The two passwords do not match.' }),
    };
    setProblems(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setError('');
    try {
      await authService.resetPassword({ token, password });
      setDone(true);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to change your password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PublicPage title="Choose a new password">
      <Card className="max-w-xl">
        {!token ? (
          <div className="space-y-4 p-5">
            <Alert tone="error">This link is incomplete. Open the link from your email again, or ask for a new one.</Alert>
            <div className="flex justify-end border-t border-ink-200 pt-4">
              <ButtonLink to="/forgot-password">Send a new link</ButtonLink>
            </div>
          </div>
        ) : done ? (
          <div className="space-y-4 p-5">
            <Alert tone="success">Your password has been changed. Every device has been signed out.</Alert>
            <div className="flex justify-end border-t border-ink-200 pt-4">
              <ButtonLink to="/login">Sign in</ButtonLink>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4 p-5">
            {error && (
              <Alert tone="error">
                {error} <ButtonLink to="/forgot-password" variant="ghost" size="sm">Send a new link</ButtonLink>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="reset-password"
                label="New password"
                type="password"
                autoComplete="new-password"
                autoFocus
                required
                value={password}
                error={problems.password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <TextField
                id="reset-confirm"
                label="New password again"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                error={problems.confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            <p className="text-xs text-ink-500">At least 8 characters, with a letter and a number.</p>
            <div className="flex justify-end border-t border-ink-200 pt-4">
              <Button type="submit" isLoading={saving}>Change password</Button>
            </div>
          </form>
        )}
      </Card>
    </PublicPage>
  );
}
