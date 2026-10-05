import { useState } from 'react';
import Alert from '../../components/common/Alert.jsx';
import Button, { ButtonLink } from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import TextField from '../../components/common/TextField.jsx';
import PublicPage from '../../components/enrollment/PublicPage.jsx';
import { authService } from '../../services/auth.service.js';
import { getErrorMessage } from '../../utils/errors.js';

/** Asks for a password reset link. The page says the same thing whether or not the email has an account. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter the email address you sign in with.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await authService.forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'Unable to send the reset link.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <PublicPage title="Forgot your password?" description="Enter your sign-in email and we will send you a link to choose a new password.">
      <Card className="max-w-xl">
        {sentTo ? (
          <div className="space-y-4 p-5">
            <Alert tone="success">
              If {sentTo} has an account, a reset link is on its way. It works once and for 30 minutes. Check your spam
              folder if it does not arrive.
            </Alert>
            <div className="flex justify-end border-t border-ink-200 pt-4">
              <ButtonLink to="/login">Back to sign in</ButtonLink>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4 p-5">
            {error && <Alert tone="error">{error}</Alert>}
            <TextField
              id="forgot-email"
              label="Email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="flex flex-col-reverse gap-2 border-t border-ink-200 pt-4 sm:flex-row sm:justify-end">
              <ButtonLink to="/login" variant="secondary">Back to sign in</ButtonLink>
              <Button type="submit" isLoading={sending}>Send reset link</Button>
            </div>
          </form>
        )}
      </Card>
    </PublicPage>
  );
}
