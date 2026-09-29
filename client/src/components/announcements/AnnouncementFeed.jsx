import { Megaphone } from 'lucide-react';
import Alert from '../common/Alert.jsx';
import Button from '../common/Button.jsx';
import Pagination from '../common/Pagination.jsx';
import Spinner from '../common/Spinner.jsx';
import { formatDateTime } from '../../utils/format.js';

/** Treat saves more than a minute after posting as edits. */
const wasEdited = (announcement) =>
  new Date(announcement.updatedAt).getTime() - new Date(announcement.createdAt).getTime() > 60_000;

export function AnnouncementCard({ announcement, actions, showClassroom = false }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 font-medium text-indigo-700">
            {announcement.type}
          </span>
          {showClassroom && announcement.classroom?.name && (
            <span className="font-medium text-slate-700">{announcement.classroom.name}</span>
          )}
          <time dateTime={announcement.createdAt}>{formatDateTime(announcement.createdAt)}</time>
          {announcement.createdBy && (
            <span>
              by {announcement.createdBy.firstName} {announcement.createdBy.lastName}
            </span>
          )}
          {wasEdited(announcement) && <span className="italic">Edited</span>}
        </div>
        {actions}
      </div>
      <h3 className="mt-2 text-base font-semibold text-slate-900">{announcement.title}</h3>
      <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
        {announcement.body}
      </p>
    </article>
  );
}

/** A paged list of announcement cards with loading, error and empty states. */
export default function AnnouncementFeed({
  list,
  emptyTitle = 'No announcements yet',
  emptyMessage,
  emptyAction,
  renderActions,
  showClassroom = false,
}) {
  const { status, items, pagination, error, reload, setPage } = list;

  if (status === 'error') {
    return (
      <div className="space-y-3">
        <Alert tone="error">{error}</Alert>
        <Button variant="secondary" onClick={reload}>
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
      <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <Megaphone className="size-6" aria-hidden="true" />
        </span>
        <h3 className="mt-4 font-semibold text-slate-900">{emptyTitle}</h3>
        {emptyMessage && <p className="mt-1 text-sm text-slate-600">{emptyMessage}</p>}
        {emptyAction}
      </div>
    );
  }

  return (
    <div className={`transition-opacity ${status === 'loading' ? 'opacity-60' : ''}`}>
      <ul className="space-y-4">
        {items.map((announcement) => (
          <li key={announcement.id}>
            <AnnouncementCard
              announcement={announcement}
              actions={renderActions?.(announcement)}
              showClassroom={showClassroom}
            />
          </li>
        ))}
      </ul>

      <Pagination
        className="mt-5"
        pagination={pagination}
        itemCount={items.length}
        disabled={status === 'loading'}
        onPageChange={setPage}
      />
    </div>
  );
}
