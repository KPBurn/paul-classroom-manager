import { zodResolver } from '@hookform/resolvers/zod';
import { Megaphone, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import Modal from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import TextField, { TextAreaField } from '../../components/common/TextField.jsx';
import { useAnnouncements } from '../../hooks/useAnnouncements.js';
import { announcementService } from '../../services/announcement.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';

// Keep in sync with ANNOUNCEMENT_LIMITS in server/src/models/Announcement.js.
const LIMITS = { title: 120, body: 2000, type: 30 };
const SUGGESTED_TYPES = ['General', 'Academic', 'Event', 'Holiday', 'Reminder', 'Urgent'];
const PAGE_SIZE = 10;

const text = (label, max) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

const announcementSchema = z.object({
  title: text('Title', LIMITS.title),
  body: text('Body', LIMITS.body),
  type: text('Type', LIMITS.type),
});

const EMPTY_FORM = { title: '', body: '', type: '' };

export default function Announcements() {
  const location = useLocation();
  const navigate = useNavigate();

  const list = useAnnouncements(PAGE_SIZE);

  // The dashboard's "Create announcement" button links here with this flag.
  const [isFormOpen, setIsFormOpen] = useState(Boolean(location.state?.openCreate));
  const [pendingAnnouncement, setPendingAnnouncement] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({ resolver: zodResolver(announcementSchema), defaultValues: EMPTY_FORM });
  const [title, body, type] = watch(['title', 'body', 'type']);

  useEffect(() => {
    // Clear the flag so a page refresh does not reopen the form.
    if (location.state?.openCreate) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  const openForm = () => setIsFormOpen(true);

  const closeForm = () => {
    if (!isPublishing) setIsFormOpen(false);
  };

  const publish = async () => {
    setIsPublishing(true);
    try {
      await announcementService.create(pendingAnnouncement);
      toast.success('Announcement created.');
      setPendingAnnouncement(null);
      setIsFormOpen(false);
      reset(EMPTY_FORM);
      // Show the new announcement, which is always first on page 1.
      if (list.page === 1) list.reload();
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
        description="Create announcements and review the ones already published."
        actions={
          <Button onClick={openForm}>
            <Plus className="size-4" aria-hidden="true" />
            Create Announcement
          </Button>
        }
      />

      <AnnouncementList list={list} onRetry={list.reload} onCreate={openForm} onPageChange={list.setPage} />

      <Modal
        open={isFormOpen}
        onClose={closeForm}
        title="Create Announcement"
        description="You will be asked to confirm before it is created."
        size="max-w-2xl"
      >
        <form onSubmit={handleSubmit(setPendingAnnouncement)} noValidate className="space-y-5">
          <TextField
            id="announcement-title"
            label="Title"
            maxLength={LIMITS.title}
            count={title.length}
            placeholder="e.g. Enrollment for the second semester"
            error={errors.title?.message}
            {...register('title')}
          />

          <TextField
            id="announcement-type"
            label="Type"
            list="announcement-types"
            maxLength={LIMITS.type}
            count={type.length}
            placeholder="Pick a suggestion or type your own"
            autoComplete="off"
            error={errors.type?.message}
            {...register('type')}
          />
          <datalist id="announcement-types">
            {SUGGESTED_TYPES.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>

          <TextAreaField
            id="announcement-body"
            label="Body"
            rows={8}
            maxLength={LIMITS.body}
            count={body.length}
            placeholder="Write the announcement…"
            error={errors.body?.message}
            {...register('body')}
          />

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>

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
    </>
  );
}

function AnnouncementList({ list, onRetry, onCreate, onPageChange }) {
  const { status, items, pagination, error } = list;

  if (status === 'error') {
    return (
      <div className="space-y-3">
        <Alert tone="error">{error}</Alert>
        <Button variant="secondary" onClick={onRetry}>
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
        <h2 className="mt-4 font-semibold text-slate-900">No announcements yet</h2>
        <p className="mt-1 text-sm text-slate-600">Announcements you create will be listed here.</p>
        <Button className="mt-5" onClick={onCreate}>
          <Plus className="size-4" aria-hidden="true" />
          Create Announcement
        </Button>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition-opacity ${status === 'loading' ? 'opacity-60' : ''}`}>
      <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
        List of Created Announcements
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3">Title</th>
              <th scope="col" className="px-5 py-3">Type</th>
              <th scope="col" className="whitespace-nowrap px-5 py-3">Creation Date</th>
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
        onPageChange={onPageChange}
      />
    </div>
  );
}
