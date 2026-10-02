import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import AnnouncementFeed from '../../components/announcements/AnnouncementFeed.jsx';
import AnnouncementFormModal from '../../components/announcements/AnnouncementFormModal.jsx';
import { useAnnouncementActions } from '../../components/announcements/useAnnouncementActions.jsx';
import Button from '../../components/common/Button.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Tabs from '../../components/common/Tabs.jsx';
import { useAnnouncements } from '../../hooks/useAnnouncements.js';
import { announcementService } from '../../services/announcement.service.js';
import { getErrorMessage } from '../../utils/errors.js';

const PAGE_SIZE = 10;
const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export default function Announcements() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState('active');
  const list = useAnnouncements(PAGE_SIZE, { status });
  const actions = useAnnouncementActions(list.reload);

  // The dashboard's "Create announcement" button links here with this flag.
  const [isFormOpen, setIsFormOpen] = useState(Boolean(location.state?.openCreate));
  const [pendingAnnouncement, setPendingAnnouncement] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    // Clear the flag so a page refresh does not reopen the form.
    if (location.state?.openCreate) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  const openForm = () => setIsFormOpen(true);

  const publish = async () => {
    setIsPublishing(true);
    try {
      await announcementService.create(pendingAnnouncement);
      toast.success('Announcement created.');
      setPendingAnnouncement(null);
      setIsFormOpen(false);
      // Show the new announcement, which is always first on page 1 of the active list.
      if (status !== 'active') setStatus('active');
      else if (list.page === 1) list.reload();
      else list.setPage(1);
    } catch (error) {
      // Keep the form open with the admin's text so they can fix and retry.
      setPendingAnnouncement(null);
      toast.error(getErrorMessage(error, 'Unable to create announcement.'));
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Create school-wide announcements, and edit, archive or delete published ones."
        actions={
          <Button onClick={openForm}>
            <Plus className="size-4" aria-hidden="true" />
            Create Announcement
          </Button>
        }
      />

      <Tabs label="Announcement status" options={TABS} value={status} onChange={setStatus} className="mb-4" />

      <AnnouncementFeed
        list={list}
        renderActions={actions.renderActions}
        emptyTitle={status === 'archived' ? 'No archived announcements' : 'No announcements yet'}
        emptyMessage={status === 'archived'
          ? 'Announcements you archive are kept here and can be restored.'
          : 'Announcements you create will be listed here.'}
        emptyAction={status === 'active' && (
          <Button onClick={openForm}>
            <Plus className="size-4" aria-hidden="true" />
            Create Announcement
          </Button>
        )}
      />

      <AnnouncementFormModal
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={setPendingAnnouncement}
        title="Create Announcement"
        description="You will be asked to confirm before it is created."
        submitLabel="Create"
        isSaving={isPublishing}
      />

      <ConfirmDialog
        open={Boolean(pendingAnnouncement)}
        title="Create this announcement?"
        message={
          pendingAnnouncement && (
            <p>
              <span className="font-medium text-ink-900">“{pendingAnnouncement.title}”</span> will be
              created as a <span className="font-medium text-ink-900">{pendingAnnouncement.type}</span>{' '}
              announcement.
            </p>
          )
        }
        confirmLabel="Yes, create"
        isLoading={isPublishing}
        onConfirm={publish}
        onCancel={() => setPendingAnnouncement(null)}
      />

      {actions.dialogs}
    </>
  );
}
