import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import { announcementService } from '../../services/announcement.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import AnnouncementFormModal from './AnnouncementFormModal.jsx';

/**
 * Edit, archive, restore and delete for announcements. Render `dialogs` once,
 * and `renderActions(announcement)` wherever an announcement is listed.
 */
export function useAnnouncementActions(onChanged) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const saveEdit = async (values) => {
    setIsSaving(true);
    try {
      await announcementService.update(editing.id, values);
      toast.success('Announcement updated.');
      setEditing(null);
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to update the announcement.'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleArchive = async (announcement) => {
    setBusyId(announcement.id);
    const archiving = announcement.status !== 'archived';
    try {
      if (archiving) await announcementService.archive(announcement.id);
      else await announcementService.restore(announcement.id);
      toast.success(archiving ? 'Announcement archived.' : 'Announcement restored.');
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, `Unable to ${archiving ? 'archive' : 'restore'} the announcement.`));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    setIsSaving(true);
    try {
      await announcementService.remove(deleting.id);
      toast.success('Announcement deleted.');
      setDeleting(null);
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to delete the announcement.'));
    } finally {
      setIsSaving(false);
    }
  };

  const renderActions = (announcement) => {
    const archived = announcement.status === 'archived';
    const busy = busyId === announcement.id;
    const buttonClass = 'inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50';
    return (
      <div className="flex shrink-0 items-center justify-center gap-1">
        <button
          type="button"
          className={buttonClass}
          onClick={() => setEditing(announcement)}
          aria-label={`Edit ${announcement.title}`}
          title="Edit"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => toggleArchive(announcement)}
          disabled={busy}
          aria-label={`${archived ? 'Restore' : 'Archive'} ${announcement.title}`}
          title={archived ? 'Restore' : 'Archive'}
        >
          {archived
            ? <ArchiveRestore className="size-4" aria-hidden="true" />
            : <Archive className="size-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={`${buttonClass} hover:!bg-red-50 hover:!text-red-600`}
          onClick={() => setDeleting(announcement)}
          aria-label={`Delete ${announcement.title}`}
          title="Delete"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  };

  const dialogs = (
    <>
      <AnnouncementFormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={saveEdit}
        initialValues={editing}
        title="Edit Announcement"
        submitLabel="Save changes"
        isSaving={isSaving}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this announcement?"
        message={
          deleting && (
            <p>
              <span className="font-medium text-slate-900">“{deleting.title}”</span> will be permanently deleted.
              To hide it but keep a record, archive it instead.
            </p>
          )
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        isLoading={isSaving}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );

  return { renderActions, dialogs };
}
