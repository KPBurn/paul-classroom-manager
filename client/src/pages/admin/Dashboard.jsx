import { Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import ModuleGrid from '../../components/dashboard/ModuleGrid.jsx';
import { adminNavigation, navigationItems } from '../../config/navigation.js';
import { useAuth } from '../../hooks/useAuth.js';

const modules = navigationItems(adminNavigation).filter((item) => item.to !== '/admin');

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        description={`Welcome back, ${user.firstName}.`}
        actions={
          <Link
            to="/admin/announcements"
            state={{ openCreate: true }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <Megaphone className="size-4" aria-hidden="true" />
            Create Announcement
          </Link>
        }
      />

      <div className="mb-6">
        <Alert>
          Reporting and recent activity summaries will appear here in a later phase. Manage classroom
          assignments from Classrooms and session attendance from the teacher Schedule module.
        </Alert>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Modules</h2>
      <ModuleGrid items={modules} />
    </>
  );
}
