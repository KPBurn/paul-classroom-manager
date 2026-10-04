import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Alert, { ErrorState } from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button, { ButtonLink } from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { FilterSelect, ListToolbar, SearchInput } from '../../components/common/ListFilters.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import Modal, { ModalActions } from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import Tabs from '../../components/common/Tabs.jsx';
import { inputClass, labelClass } from '../../components/common/TextField.jsx';
import EarningsBreakdown from '../../components/salary/EarningsBreakdown.jsx';
import WithdrawalList from '../../components/salary/WithdrawalList.jsx';
import { reportingTimezone, salaryService } from '../../services/salary.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatAmount } from '../../utils/format.js';

const PAGE_SIZE = 20;

const TABS = [
  { value: 'teachers', label: 'Teachers' },
  { value: 'withdrawals', label: 'Withdrawals' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const Cell = ({ label, value, hint }) => (
  <div className="min-w-0">
    <p className="text-xs text-ink-500">{label}</p>
    <p className="text-sm font-medium tabular-nums text-ink-900">{formatAmount(value)}</p>
    {hint && <p className="truncate text-xs text-ink-500">{hint}</p>}
  </div>
);

function TeacherRow({ item, defaultRate, onOpen }) {
  const { teacher, totals, classes, minutes, balance } = item;
  const rate = teacher.sessionRate;
  return (
    <li className="grid gap-3 px-5 py-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,6.5rem))_auto] lg:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-900">{teacher.name}</p>
        <p className="truncate text-xs text-ink-500">{teacher.email}</p>
      </div>
      <Cell
        label="Rate"
        value={rate ?? defaultRate}
        hint={rate != null ? 'Individual' : 'Class rate'}
      />
      <Cell label="Today" value={totals.today} />
      <Cell label="This week" value={totals.week} />
      <Cell label="This month" value={totals.month} />
      <Cell
        label="Available"
        value={balance.available}
        hint={`${classes} ${classes === 1 ? 'class' : 'classes'} · ${minutes} min in class`}
      />
      <Button size="sm" variant="secondary" onClick={() => onOpen(item)}>View classes</Button>
    </li>
  );
}

/** The administrator's approval form: approve or reject, with a note for the teacher. */
function ReviewForm({ request, status, onCancel, onSave }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ status, ...(note.trim() && { reviewNote: note.trim() }) });
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save that decision.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-ink-600">
        {request?.teacher?.name} asked for{' '}
        <span className="font-medium tabular-nums text-ink-900">{formatAmount(request?.amount)}</span>
        . {status === 'approved' ? 'Approving takes it out of what they can still withdraw.' : 'Rejecting leaves their balance unchanged.'}
      </p>
      <label className={labelClass}>Note for the teacher (optional)
        <input
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Paid at the desk"
          className={inputClass(false, 'mt-1.5 font-normal')}
        />
      </label>
      <ModalActions>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" variant={status === 'rejected' ? 'danger' : 'primary'} isLoading={saving}>
          {status === 'approved' ? 'Approve withdrawal' : 'Reject withdrawal'}
        </Button>
      </ModalActions>
    </form>
  );
}

export default function AdminSalaries() {
  const timezone = reportingTimezone();
  const [tab, setTab] = useState('teachers');
  const [teachers, setTeachers] = useState({ items: [], pagination: null, defaultRate: 100 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState({ items: [], pagination: null });
  const [requestPage, setRequestPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState('');
  const [detailTeacher, setDetailTeacher] = useState(null);
  const [detailSummary, setDetailSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [granularity, setGranularity] = useState('day');
  const [review, setReview] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTeachers(await salaryService.teachers({ page, limit: PAGE_SIZE, search, timezone }));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load teachers.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, timezone]);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError('');
    try {
      setRequests(await salaryService.withdrawals({ page: requestPage, limit: PAGE_SIZE, status }));
    } catch (loadError) {
      setRequestsError(getErrorMessage(loadError, 'Unable to load withdrawal requests.'));
    } finally {
      setRequestsLoading(false);
    }
  }, [requestPage, status]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // One teacher's classes, refetched when the grouping changes.
  useEffect(() => {
    if (!detailTeacher) return undefined;
    let cancelled = false;
    setSummaryLoading(true);
    salaryService.summary({ teacherId: detailTeacher.id, timezone, granularity })
      .then((summary) => {
        if (!cancelled) setDetailSummary(summary);
      })
      .catch((loadError) => {
        if (!cancelled) toast.error(getErrorMessage(loadError, 'Unable to load those classes.'));
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailTeacher, granularity, timezone]);

  const saveReview = async (values) => {
    await salaryService.reviewWithdrawal(review.item.id, values);
    toast.success(values.status === 'approved' ? 'Withdrawal approved.' : 'Withdrawal rejected.');
    setReview(null);
    await Promise.all([loadRequests(), loadTeachers()]);
  };

  const cancelWithdrawal = async () => {
    setBusy(true);
    try {
      await salaryService.cancelWithdrawal(cancelTarget.id);
      toast.success('Request cancelled.');
      setCancelTarget(null);
      await Promise.all([loadRequests(), loadTeachers()]);
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, 'Unable to cancel that request.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Salaries"
        description={`A class pays a teacher's individual rate when they have one, otherwise that class's rate, otherwise the school default of ${formatAmount(teachers.defaultRate)}.`}
        badges={<Badge tone="info">Rate {formatAmount(teachers.defaultRate)}</Badge>}
        actions={(
          <ButtonLink to="/admin/settings" variant="secondary" size="sm">
            <Settings2 className="size-4" aria-hidden="true" /> Class rate
          </ButtonLink>
        )}
      />

      <Tabs label="Salary views" options={TABS} value={tab} onChange={setTab} className="mb-4" />

      {tab === 'teachers' ? (
        <>
          <ListToolbar count={loading ? undefined : teachers.pagination?.total} noun="teacher">
            <SearchInput
              id="salary-search"
              label="Search teachers"
              value={search}
              onChange={(value) => { setSearch(value); setPage(1); }}
              placeholder="Search name or email"
              className="sm:w-72"
            />
          </ListToolbar>

          {error ? <ErrorState message={error} onRetry={loadTeachers} /> : loading ? (
            <PageLoader label="Loading teachers..." />
          ) : teachers.items.length === 0 ? (
            <EmptyState icon={Users} title="No teachers" message="There are no teacher accounts to show earnings for." />
          ) : (
            <Card as="ul" className="divide-y divide-ink-200">
              <li className="hidden gap-3 bg-ink-50 px-5 py-2 text-xs font-medium uppercase tracking-wider text-ink-500 lg:grid lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,6.5rem))_auto]">
                <span>Teacher</span>
                <span>Rate</span>
                <span>Today</span>
                <span>This week</span>
                <span>This month</span>
                <span>Available</span>
                <span className="sr-only">Actions</span>
              </li>
              {teachers.items.map((item) => (
                <TeacherRow key={item.teacher.id} item={item} defaultRate={teachers.defaultRate} onOpen={setDetailTeacher} />
              ))}
            </Card>
          )}

          {teachers.pagination && teachers.pagination.totalPages > 1 && (
            <Pagination
              className="mt-4"
              pagination={teachers.pagination}
              itemCount={teachers.items.length}
              onPageChange={setPage}
            />
          )}
        </>
      ) : (
        <>
          <ListToolbar count={requestsLoading ? undefined : requests.pagination?.total} noun="request">
            <FilterSelect
              id="salary-status"
              label="Status"
              value={status}
              onChange={(value) => { setStatus(value); setRequestPage(1); }}
              options={STATUS_OPTIONS}
              className="sm:w-40"
            />
          </ListToolbar>

          {requestsError ? <ErrorState message={requestsError} onRetry={loadRequests} /> : requestsLoading ? (
            <PageLoader label="Loading withdrawal requests..." />
          ) : (
            <Card as="section">
              <WithdrawalList
                items={requests.items}
                emptyMessage={status === 'pending'
                  ? 'No requests are waiting for approval.'
                  : 'No withdrawal requests match this status.'}
                onReview={(item, decision) => setReview({ item, status: decision })}
                onCancel={setCancelTarget}
              />
            </Card>
          )}

          {requests.pagination && requests.pagination.totalPages > 1 && (
            <Pagination
              className="mt-4"
              pagination={requests.pagination}
              itemCount={requests.items.length}
              onPageChange={setRequestPage}
            />
          )}
        </>
      )}

      <Modal
        open={Boolean(detailTeacher)}
        onClose={() => { setDetailTeacher(null); setDetailSummary(null); }}
        title={detailTeacher?.name ?? ''}
        description="Classes in the last 90 days, and what they paid."
        size="max-w-3xl"
      >
        {!detailSummary && summaryLoading ? (
          <PageLoader label="Loading classes..." className="py-8" />
        ) : detailSummary ? (
          <>
            <p className="mb-4 text-sm text-ink-600">
              Earned in this period:{' '}
              <span className="font-medium tabular-nums text-ink-900">
                {formatAmount(detailSummary.classes.reduce((sum, line) => sum + line.amount, 0))}
              </span>
              {' · '}
              lifetime {formatAmount(detailSummary.balance.earned)}
            </p>
            <EarningsBreakdown
              summary={detailSummary}
              granularity={granularity}
              onGranularityChange={setGranularity}
            />
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={review?.status === 'approved' ? 'Approve withdrawal' : 'Reject withdrawal'}
        size="max-w-md"
      >
        {review && (
          <ReviewForm
            request={review.item}
            status={review.status}
            onCancel={() => setReview(null)}
            onSave={saveReview}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this withdrawal?"
        message={cancelTarget && `${cancelTarget.teacher?.name} will see the request for ${formatAmount(cancelTarget.amount)} removed.`}
        confirmLabel="Cancel request"
        confirmVariant="danger"
        isLoading={busy}
        onConfirm={cancelWithdrawal}
        onCancel={() => setCancelTarget(null)}
      />
    </>
  );
}