import { Megaphone } from 'lucide-react';
import Alert from '../../components/common/Alert.jsx';
import { ButtonLink } from '../../components/common/Button.jsx';
import { SectionLabel } from '../../components/common/Card.jsx';
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
          <ButtonLink to="/admin/announcements" state={{ openCreate: true }}>
            <Megaphone className="size-4" aria-hidden="true" />
            Create Announcement
          </ButtonLink>
        }
      />

      <div className="mb-8">
        <Alert>
          Reporting and recent activity summaries will appear here in a later phase. Manage classroom
          assignments from Classrooms and session attendance from the teacher Schedule module.
        </Alert>
      </div>

      <SectionLabel className="mb-3">Modules</SectionLabel>
      <ModuleGrid items={modules} />
    </>
  );
}
