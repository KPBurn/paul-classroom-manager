import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '../common/Alert.jsx';
import Badge from '../common/Badge.jsx';
import Button from '../common/Button.jsx';
import Card from '../common/Card.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Modal from '../common/Modal.jsx';
import Pagination from '../common/Pagination.jsx';
import { PageLoader } from '../common/Spinner.jsx';
import { formatDateTime } from '../../utils/format.js';

/** Treat saves more than a minute after posting as edits. */
const wasEdited = (announcement) =>
  new Date(announcement.updatedAt).getTime() - new Date(announcement.createdAt).getTime() > 60_000;

const authorName = (announcement) => (announcement.createdBy
  ? `${announcement.createdBy.firstName} ${announcement.createdBy.lastName}`.trim()
  : 'School');

/** Like an inbox: the time for today, the month and day this year, the full date otherwise. */
export function shortDate(value) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The full announcement, opened from a list. */
export function AnnouncementDialog({ announcement, onClose, actions, showClassroom = false }) {
  return (
    <Modal open={Boolean(announcement)} onClose={onClose} title={announcement?.title ?? ''} size="max-w-2xl">
      {announcement && (
        <>
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
              <Badge>{announcement.type}</Badge>
              <span className="font-medium text-ink-700">{authorName(announcement)}</span>
              {showClassroom && announcement.classroom?.name && <span>{announcement.classroom.name}</span>}
              <time dateTime={announcement.createdAt}>{formatDateTime(announcement.createdAt)}</time>
              {wasEdited(announcement) && <span>Edited</span>}
              {announcement.status === 'archived' && <Badge>Archived</Badge>}
            </div>
            {actions}
          </div>
          <p className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-line break-words text-sm leading-relaxed text-ink-700">
            {announcement.body}
          </p>
          <div className="mt-6 flex justify-end">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/**
 * A paged, inbox-style list of announcements. Each row shows a one-line
 * preview and opens the full announcement when clicked.
 */
export default function AnnouncementFeed({
  list,
  emptyTitle = 'No announcements yet',
  emptyMessage,
  emptyAction,
  renderActions,
  showClassroom = false,
}) {
  const { status, items, pagination, error, reload, setPage } = list;
  const [openId, setOpenId] = useState(null);
  const opened = items.find((item) => item.id === openId) ?? null;
  const close = () => setOpenId(null);
  // Starting an edit, archive or delete from the open announcement closes it first.
  const actionsFor = (announcement) => renderActions && (
    <div onClickCapture={close}>{renderActions(announcement)}</div>
  );

  if (status === 'error') return <ErrorState message={error} onRetry={reload} />;

  if (status === 'loading' && items.length === 0) return <PageLoader label="Loading announcements…" />;

  if (items.length === 0) {
    return <EmptyState icon={Megaphone} title={emptyTitle} message={emptyMessage} action={emptyAction || undefined} />;
  }

  return (
    <div className={`transition-opacity ${status === 'loading' ? 'opacity-60' : ''}`}>
      <Card as="ul" className="divide-y divide-ink-200 overflow-hidden">
        {items.map((announcement) => (
          // The whole row opens the announcement; the inner button keeps it reachable by keyboard.
          <li
            key={announcement.id}
            onClick={() => setOpenId(announcement.id)}
            className="flex cursor-pointer items-center gap-2 pr-3 transition hover:bg-ink-50"
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setOpenId(announcement.id);
              }}
              className="flex min-w-0 flex-1 flex-col gap-1 py-3 pl-5 pr-2 text-left focus-visible:-outline-offset-2 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  <span className="font-medium text-ink-900">{announcement.title}</span>
                  <span className="text-ink-500"> – {announcement.body.replace(/\s+/g, ' ')}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-500">
                  {authorName(announcement)}
                  {showClassroom && announcement.classroom?.name && ` · ${announcement.classroom.name}`}
                  {announcement.status === 'archived' && ' · Archived'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3 sm:justify-end">
                <Badge className="max-w-40 overflow-hidden">{announcement.type}</Badge>
                <time dateTime={announcement.createdAt} className="whitespace-nowrap text-xs tabular-nums text-ink-500 sm:w-16 sm:text-right">
                  {shortDate(announcement.createdAt)}
                </time>
              </span>
            </button>
            {renderActions && (
              <div className="flex shrink-0 items-center self-stretch" onClick={(event) => event.stopPropagation()}>
                {renderActions(announcement)}
              </div>
            )}
          </li>
        ))}
      </Card>

      <Pagination
        className="mt-5"
        pagination={pagination}
        itemCount={items.length}
        disabled={status === 'loading'}
        onPageChange={setPage}
      />

      <AnnouncementDialog
        announcement={opened}
        onClose={close}
        actions={opened && actionsFor(opened)}
        showClassroom={showClassroom}
      />
    </div>
  );
}
