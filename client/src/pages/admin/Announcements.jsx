import { Megaphone, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import AnnouncementFormModal from '../../components/announcements/AnnouncementFormModal.jsx';
import { useAnnouncementActions } from '../../components/announcements/useAnnouncementActions.jsx';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAnnouncements } from '../../hooks/useAnnouncements.js';
import { announcementService } from '../../services/announcement.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';

const PAGE_SIZE = 10;
const TABS = [
  { status: 'active', label: 'Active' },
  { status: 'archived', label: 'Archived' },
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

      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Announcement status">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            role="tab"
            aria-selected={status === tab.status}
            onClick={() => setStatus(tab.status)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${status === tab.status ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnnouncementTable list={list} archived={status === 'archived'} onCreate={openForm} renderActions={actions.renderActions} />

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
              <span className="font-medium text-slate-900">“{pendingAnnouncement.title}”</span> will be
              created as a <span className="font-medium text-slate-900">{pendingAnnouncement.type}</span>{' '}
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

function AnnouncementTable({ list, archived, onCreate, renderActions }) {
  const { status, items, pagination, error } = list;

  if (status === 'error') {
    return (
      <div className="space-y-3">
        <Alert tone="error">{error}</Alert>
        <Button variant="secondary" onClick={list.reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (status === 'loading' && items.length === 0) {
    return (
      <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-16 text-indigo-600">
        <Spinner className="size-6" />
        <span className="sr-only">Loading announcements…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <Megaphone className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-semibold text-slate-900">
          {archived ? 'No archived announcements' : 'No announcements yet'}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {archived
            ? 'Announcements you archive are kept here and can be restored.'
            : 'Announcements you create will be listed here.'}
        </p>
        {!archived && (
          <Button className="mt-5" onClick={onCreate}>
            <Plus className="size-4" aria-hidden="true" />
            Create Announcement
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition-opacity ${status === 'loading' ? 'opacity-60' : ''}`}>
      <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
        {archived ? 'Archived Announcements' : 'List of Created Announcements'}
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3">Title</th>
              <th scope="col" className="px-5 py-3">Type</th>
              <th scope="col" className="whitespace-nowrap px-5 py-3">Creation Date</th>
              <th scope="col" className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((announcement) => (
              <tr key={announcement.id} className="align-top hover:bg-slate-50">
                <td className="max-w-md px-5 py-3.5">
                  <p className="font-medium text-slate-900">{announcement.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-slate-500">{announcement.body}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex whitespace-nowrap rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    {announcement.type}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                  <time dateTime={announcement.createdAt}>{formatDateTime(announcement.createdAt)}</time>
                </td>
                <td className="px-5 py-2.5">
                  <div className="flex justify-end">{renderActions(announcement)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        className="border-t border-slate-200 px-5 py-3"
        pagination={pagination}
        itemCount={items.length}
        disabled={status === 'loading'}
        onPageChange={list.setPage}
      />
    </div>
  );
}
