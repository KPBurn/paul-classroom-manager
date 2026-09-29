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

      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xs">
        <dl className="divide-y divide-slate-100">
          {fields.map(([label, value]) => (
            <div key={label} className="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:gap-4">
              <dt className="text-sm font-medium text-slate-500">{label}</dt>
              <dd className="break-words text-sm text-slate-900 sm:col-span-2">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
