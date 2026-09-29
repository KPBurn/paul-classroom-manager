import { Megaphone } from 'lucide-react';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAnnouncements } from '../../hooks/useAnnouncements.js';
import { formatDateTime } from '../../utils/format.js';

const PAGE_SIZE = 10;

export default function TeacherAnnouncements() {
  const { status, items, pagination, error, setPage, reload } = useAnnouncements(PAGE_SIZE);

  return (
    <>
      <PageHeader title="Announcements" description="Updates from your school administrators." />
      <AnnouncementFeed
        status={status}
        items={items}
        pagination={pagination}
        error={error}
        onRetry={reload}
        onPageChange={setPage}
      />
    </>
  );
}

function AnnouncementFeed({ status, items, pagination, error, onRetry, onPageChange }) {
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
        <p className="mt-1 text-sm text-slate-600">New announcements from administrators will appear here.</p>
      </div>
    );
  }

  return (
    <div className={`max-w-3xl transition-opacity ${status === 'loading' ? 'opacity-60' : ''}`}>
      <ul className="space-y-4">
        {items.map((announcement) => (
          <li key={announcement.id}>
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 font-medium text-indigo-700">
                  {announcement.type}
                </span>
                <time dateTime={announcement.createdAt}>{formatDateTime(announcement.createdAt)}</time>
                {announcement.createdBy && (
                  <span>
                    by {announcement.createdBy.firstName} {announcement.createdBy.lastName}
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-base font-semibold text-slate-900">{announcement.title}</h2>
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
                {announcement.body}
              </p>
            </article>
          </li>
        ))}
      </ul>

      <Pagination
        className="mt-5"
        pagination={pagination}
        itemCount={items.length}
        disabled={status === 'loading'}
        onPageChange={onPageChange}
      />
    </div>
  );
}
