import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import Alert from '../../components/common/Alert.jsx';
import Button, { IconButton } from '../../components/common/Button.jsx';
import Card, { CardHeader } from '../../components/common/Card.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import AvailabilityEditor from '../../components/schedule/AvailabilityEditor.jsx';
import TextField from '../../components/common/TextField.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { getErrorMessage } from '../../utils/errors.js';
import { ROLE_LABELS } from '../../utils/roles.js';

// Keep in sync with passwordSchema in server/src/validators/auth.validators.js.
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters')
      .regex(/[A-Za-z]/, 'Password must contain a letter')
      .regex(/\d/, 'Password must contain a number'),
    confirmPassword: z.string().min(1, 'Enter the new password again'),
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password that is different from your current one',
  })
  .refine((values) => values.confirmPassword === values.newPassword, {
    path: ['confirmPassword'],
    message: 'The two new passwords do not match',
  });

function ChangePassword() {
  const { changePassword } = useAuth();
  const [shown, setShown] = useState(false);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async ({ currentPassword, newPassword }) => {
    setServerError('');
    try {
      await changePassword({ currentPassword, newPassword });
      reset();
      toast.success('Password changed. Your other devices have been signed out.');
    } catch (error) {
      const details = error.response?.data?.details;
      if (details?.length) {
        for (const { field, message } of details) setError(field, { message });
      } else {
        setServerError(getErrorMessage(error, 'Unable to change your password.'));
      }
    }
  };

  const type = shown ? 'text' : 'password';
  return (
    <Card as="section" aria-labelledby="password-heading">
      <CardHeader
        title="Change password"
        titleId="password-heading"
        action={(
          <IconButton
            label={shown ? 'Hide passwords' : 'Show passwords'}
            icon={shown ? EyeOff : Eye}
            onClick={() => setShown((value) => !value)}
          />
        )}
      />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <TextField
          id="current-password"
          label="Current password"
          type={type}
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="new-password"
            label="New password"
            type={type}
            autoComplete="new-password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <TextField
            id="confirm-password"
            label="New password again"
            type={type}
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
        </div>
        <p className="text-xs text-ink-500">
          At least 8 characters, with a letter and a number. You stay signed in here; every other device is signed out.
        </p>
        <div className="flex justify-end border-t border-ink-200 pt-4">
          <Button type="submit" isLoading={isSubmitting}>Change password</Button>
        </div>
      </form>
    </Card>
  );
}

/** A teacher's weekly teaching times. Administrators schedule this teacher's classes inside them. */
function Availability() {
  const { user, setAvailability } = useAuth();

  return (
    <Card as="section" aria-labelledby="availability-heading">
      <CardHeader title="Teaching availability" titleId="availability-heading" />
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-500">
          The days and hours you can teach each week. Your administrator schedules your classes inside these times.
        </p>
        <AvailabilityEditor
          initial={user.availability ?? []}
          onSave={async (slots) => {
            await setAvailability(slots);
            toast.success('Availability saved.');
          }}
        />
      </div>
    </Card>
  );
}

export default function Profile() {
  const { user } = useAuth();

  const fields = [
    ['First name', user.firstName],
    ['Last name', user.lastName],
    ['Email', user.email],
    ['Role', ROLE_LABELS[user.role]],
    ['Status', user.status.charAt(0).toUpperCase() + user.status.slice(1)],
  ];

  return (
    <>
      <PageHeader
        title="Profile"
        description={user.role === 'admin'
          ? 'Your account details. Edit them from All Users.'
          : 'Your account details. Contact an administrator to change them.'}
      />

      <div className="max-w-2xl space-y-6">
        <Card as="section" aria-labelledby="details-heading">
          <CardHeader title="Account" titleId="details-heading" />
          <dl className="divide-y divide-ink-200">
            {fields.map(([label, value]) => (
              <div key={label} className="grid gap-1 px-5 py-3.5 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm text-ink-500">{label}</dt>
                <dd className="wrap-break-word text-sm text-ink-900 sm:col-span-2">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {user.role === 'teacher' && <Availability />}

        <ChangePassword />
      </div>
    </>
  );
}
