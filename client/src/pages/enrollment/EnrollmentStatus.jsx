import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button, { ButtonLink } from '../../components/common/Button.jsx';
import Card, { CardHeader } from '../../components/common/Card.jsx';
import TextField from '../../components/common/TextField.jsx';
import { ENROLLMENT_STATUS } from '../../components/enrollment/enrollmentMeta.js';
import PublicPage from '../../components/enrollment/PublicPage.jsx';
import { enrollmentService } from '../../services/enrollment.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { formatSchedule } from '../../utils/schedule.js';

const SUMMARY = {
  pending: 'Your school is still reviewing your application. Check back later.',
  approved: 'You have been approved. Create your account below to sign in and see your classes.',
  rejected: 'Your school did not approve this application.',
};

// Keep in sync with passwordSchema in server/src/validators/auth.validators.js.
function passwordProblem(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 72) return 'Password must be at most 72 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain a letter and a number.';
  return undefined;
}

function StatusBadge({ status }) {
  const { label, tone, icon } = ENROLLMENT_STATUS[status];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

/** The last step of enrolling: an approved applicant proves who they are and chooses a password. */
function CreateAccount({ lookup, onCreated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problems, setProblems] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const found = {
      ...(!email.trim() && { email: 'Enter the email address from your application.' }),
      ...(passwordProblem(password) && { password: passwordProblem(password) }),
      ...(confirm !== password && { confirm: 'The two passwords do not match.' }),
    };
    setProblems(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setError('');
    try {
      onCreated(await enrollmentService.createAccount({ ...lookup, email: email.trim(), password }));
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to create your account.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="account-heading">
      <CardHeader title="Create your account" titleId="account-heading" />
      <form onSubmit={submit} noValidate className="space-y-4 p-5">
        <p className="text-sm text-ink-500">
          To confirm it is you, enter the email address you applied with. It becomes your sign-in email.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          id="account-email"
          label="Email address on your application"
          type="email"
          autoComplete="email"
          required
          value={email}
          error={problems.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="account-password"
            label="Choose a password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            error={problems.password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            id="account-confirm"
            label="Password again"
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
          <Button type="submit" isLoading={saving}>Create account</Button>
        </div>
      </form>
    </Card>
  );
}

export default function EnrollmentStatus() {
  const [searchParams] = useSearchParams();
  const [referenceNumber, setReferenceNumber] = useState(searchParams.get('ref') ?? '');
  const [birthday, setBirthday] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  // The details that found the application, kept so the account can be created with them.
  const [lookup, setLookup] = useState(null);
  const [application, setApplication] = useState(null);
  const [account, setAccount] = useState(null);

  const check = async (event) => {
    event.preventDefault();
    const details = { referenceNumber: referenceNumber.trim().toUpperCase(), birthday };
    if (!details.referenceNumber || !birthday) {
      setError('Enter your reference number and the student’s birthday.');
      return;
    }
    setChecking(true);
    setError('');
    try {
      setApplication(await enrollmentService.status(details));
      setLookup(details);
      setAccount(null);
    } catch (checkError) {
      setApplication(null);
      const [detail] = checkError.response?.data?.details ?? [];
      setError(detail?.message ?? getErrorMessage(checkError, 'Unable to check your application.'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <PublicPage
      title="Check your application"
      description="Enter the reference number you were given when you applied, and the student’s birthday."
    >
      <div className="space-y-6">
        <Card>
          <form onSubmit={check} noValidate className="space-y-4 p-5">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="status-reference"
                label="Reference number"
                placeholder="ENR-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={13}
                required
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
                className="[&_input]:font-mono [&_input]:uppercase"
              />
              <TextField
                id="status-birthday"
                label="Student’s birthday"
                type="date"
                required
                value={birthday}
                onChange={(event) => setBirthday(event.target.value)}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <ButtonLink to="/enroll" variant="ghost" size="sm">Not applied yet? Apply for enrollment</ButtonLink>
              <Button type="submit" isLoading={checking}>Check status</Button>
            </div>
          </form>
        </Card>

        {application && (
          <Card as="section" aria-labelledby="result-heading" aria-live="polite">
            <CardHeader
              title={`Application ${application.referenceNumber}`}
              titleId="result-heading"
              action={<StatusBadge status={application.status} />}
            />
            <div className="space-y-4 p-5">
              <p className="text-sm text-ink-700">
                Hello {application.firstName}. {application.accountCreated && application.status === 'approved'
                  ? 'You have been approved and your account is ready. Sign in to see your classes.'
                  : SUMMARY[application.status]}
              </p>
              {application.adminNote && (
                <Alert>
                  <span className="font-medium">Note from your school: </span>
                  {application.adminNote}
                </Alert>
              )}
              <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200">
                {application.requests.map((request) => (
                  <li key={request.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">
                        {[request.classroom?.subject, request.classroom?.name ?? 'Class no longer listed'].filter(Boolean).join(' / ')}
                      </p>
                      <p className="text-xs text-ink-500">{formatSchedule(request.classroom?.schedule)}</p>
                    </div>
                    <StatusBadge status={request.status} />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-ink-500">Submitted {formatDateTime(application.submittedAt)}</p>
              {application.accountCreated && !account && (
                <div className="flex justify-end border-t border-ink-200 pt-4">
                  <ButtonLink to="/login">Sign in</ButtonLink>
                </div>
              )}
            </div>
          </Card>
        )}

        {account ? (
          <Alert tone="success">
            <p className="font-medium">Your account is ready.</p>
            <p className="mt-1">Sign in with {account.email} and the password you just chose.</p>
            <ButtonLink to="/login" size="sm" className="mt-3">Sign in</ButtonLink>
          </Alert>
        ) : application?.status === 'approved' && !application.accountCreated && (
          <CreateAccount
            lookup={lookup}
            onCreated={(created) => {
              setAccount(created);
              setApplication((current) => ({ ...current, accountCreated: true }));
            }}
          />
        )}
      </div>
    </PublicPage>
  );
}
