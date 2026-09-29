import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import Alert from '../common/Alert.jsx';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import Pagination from '../common/Pagination.jsx';
import Spinner from '../common/Spinner.jsx';
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
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                {announcement.type}
              </span>
              <span className="font-medium text-slate-700">{authorName(announcement)}</span>
              {showClassroom && announcement.classroom?.name && <span>{announcement.classroom.name}</span>}
              <time dateTime={announcement.createdAt}>{formatDateTime(announcement.createdAt)}</time>
              {wasEdited(announcement) && <span className="italic">Edited</span>}
              {announcement.status === 'archived' && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Archived</span>
              )}
            </div>
            {actions}
          </div>
          <p className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
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
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {items.map((announcement) => (
          // The whole row opens the announcement; the inner button keeps it reachable by keyboard.
          <li
            key={announcement.id}
            onClick={() => setOpenId(announcement.id)}
            className="group flex cursor-pointer items-center gap-2 border-l-4 border-transparent pr-2 transition hover:border-indigo-500 hover:bg-indigo-50/60"
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setOpenId(announcement.id);
              }}
              className="flex min-w-0 flex-1 flex-col gap-1.5 py-3 pl-3 pr-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="flex shrink-0 items-center gap-2 sm:w-48">
                <span className="max-w-28 truncate rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 group-hover:bg-white">
                  {announcement.type}
                </span>
                <time dateTime={announcement.createdAt} className="whitespace-nowrap text-xs font-medium text-slate-500">
                  {shortDate(announcement.createdAt)}
                </time>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  <span className="font-semibold text-slate-900 group-hover:text-indigo-800">{announcement.title}</span>
                  <span className="text-slate-500"> – {announcement.body.replace(/\s+/g, ' ')}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {authorName(announcement)}
                  {showClassroom && announcement.classroom?.name && ` · ${announcement.classroom.name}`}
                  {announcement.status === 'archived' && ' · Archived'}
                </span>
              </span>
            </button>
            {renderActions && (
              <div className="flex shrink-0 items-center self-stretch" onClick={(event) => event.stopPropagation()}>
                {renderActions(announcement)}
              </div>
            )}
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

      <AnnouncementDialog
        announcement={opened}
        onClose={close}
        actions={opened && actionsFor(opened)}
        showClassroom={showClassroom}
      />
    </div>
  );
}
