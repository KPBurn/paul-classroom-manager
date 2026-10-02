import Card from '../../components/common/Card.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { ROLE_LABELS } from '../../utils/roles.js';

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
      <PageHeader title="Profile" description="Your account details. Contact an administrator to change them." />

      <Card className="max-w-2xl">
        <dl className="divide-y divide-ink-200">
          {fields.map(([label, value]) => (
            <div key={label} className="grid gap-1 px-5 py-3.5 sm:grid-cols-3 sm:gap-4">
              <dt className="text-sm text-ink-500">{label}</dt>
              <dd className="wrap-break-word text-sm text-ink-900 sm:col-span-2">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
