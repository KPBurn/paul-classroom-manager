import { useCallback, useEffect, useState } from 'react';
import { Banknote, HandCoins, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import Alert, { ErrorState } from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import Card, { CardHeader } from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import Modal, { ModalActions } from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import StatStrip from '../../components/common/StatStrip.jsx';
import { inputClass, labelClass, SelectField } from '../../components/common/TextField.jsx';
import EarningsBreakdown from '../../components/salary/EarningsBreakdown.jsx';
import WithdrawalList, { WITHDRAWAL_METHOD_LABELS } from '../../components/salary/WithdrawalList.jsx';
import { reportingTimezone, salaryService } from '../../services/salary.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatAmount } from '../../utils/format.js';

const PAGE_SIZE = 20;

const methodOptions = Object.entries(WITHDRAWAL_METHOD_LABELS)
  .map(([value, label]) => ({ value, label }));

/** Asking for a withdrawal: how much, and how it is paid out. */
function WithdrawalForm({ available, onCancel, onSave }) {
  const [amount, setAmount] = useState(String(available));
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (value > available) {
      setError(`You can withdraw up to ${formatAmount(available)} right now.`);
      return;
    }
    setSaving(true);
    try {
      await onSave({ amount: value, method, ...(note.trim() && { note: note.trim() }) });
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to request the withdrawal.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-ink-600">
        Available to withdraw:{' '}
        <span className="font-medium tabular-nums text-ink-900">{formatAmount(available)}</span>
      </p>
      <label className={labelClass}>Amount
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className={inputClass(false, 'mt-1.5 font-normal')}
          required
        />
      </label>
      <SelectField
        id="withdrawal-method"
        label="Paid out as"
        value={method}
        onChange={(event) => setMethod(event.target.value)}
        options={methodOptions}
      />
      <label className={labelClass}>Note (optional)
        <input
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Anything the office should know"
          className={inputClass(false, 'mt-1.5 font-normal')}
        />
      </label>
      <ModalActions>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving}>Request withdrawal</Button>
      </ModalActions>
    </form>
  );
}

const BalanceRow = ({ label, value, hint, emphasis }) => (
  <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
    <dt className="text-sm text-ink-600">
      {label}
      {hint && <span className="block text-xs text-ink-500">{hint}</span>}
    </dt>
    <dd className={`text-sm tabular-nums ${emphasis ? 'font-medium text-emerald-700' : 'text-ink-900'}`}>
      {formatAmount(value)}
    </dd>
  </div>
);

export default function TeacherSalary() {
  const timezone = reportingTimezone();
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState({ items: [], pagination: null });
  const [granularity, setGranularity] = useState('day');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [earnings, withdrawals] = await Promise.all([
        salaryService.summary({ timezone, granularity }),
        salaryService.withdrawals({ page, limit: PAGE_SIZE }),
      ]);
      setSummary(earnings);
      setRequests(withdrawals);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your salary.'));
    } finally {
      setLoading(false);
    }
  }, [granularity, page, timezone]);

  useEffect(() => {
    load();
  }, [load]);

  const requestWithdrawal = async (values) => {
    await salaryService.requestWithdrawal(values);
    toast.success('Withdrawal requested.');
    setFormOpen(false);
    setPage(1);
    await load();
  };

  const cancelWithdrawal = async () => {
    setBusy(true);
    try {
      await salaryService.cancelWithdrawal(cancelTarget.id);
      toast.success('Request cancelled.');
      setCancelTarget(null);
      await load();
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, 'Unable to cancel that request.'));
    } finally {
      setBusy(false);
    }
  };

  const stats = summary && [
    { label: 'Today', value: formatAmount(summary.totals.today), hint: 'Earned today' },
    { label: 'This week', value: formatAmount(summary.totals.week), hint: 'Monday to today' },
    { label: 'This month', value: formatAmount(summary.totals.month), hint: 'This calendar month' },
    {
      label: 'Available',
      value: formatAmount(summary.balance.available),
      hint: summary.balance.pending > 0
        ? `${formatAmount(summary.balance.pending)} waiting for approval`
        : 'Ready to take out',
      emphasis: summary.balance.available > 0,
    },
  ];

  return (
    <>
      <PageHeader
        title="Salary"
        description="What each class pays, what you have earned, and what you can take out."
      />

      {error && <ErrorState message={error} onRetry={load} />}

      {loading && !summary ? (
        <PageLoader label="Loading your salary..." />
      ) : summary && (
        <div className="space-y-6">
          <StatStrip stats={stats} columns="grid-cols-2 lg:grid-cols-4" label="Earnings so far" />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <EarningsBreakdown
                summary={summary}
                granularity={granularity}
                onGranularityChange={setGranularity}
              />
            </div>

            <div className="space-y-6">
              <Card as="section" className="p-5" aria-labelledby="rate-heading">
                <h2 id="rate-heading" className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <Banknote className="size-4 text-ink-400" aria-hidden="true" /> Class rate
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  {summary.teacher.sessionRate != null ? (
                    <>
                      Your rate for a class is{' '}
                      <span className="font-medium tabular-nums text-ink-900">
                        {formatAmount(summary.teacher.sessionRate)}
                      </span>
                      , assigned to you by an administrator. It applies to every class you teach.
                    </>
                  ) : (
                    <>
                      You do not have an individual rate, so each class pays its own rate — or{' '}
                      <span className="font-medium tabular-nums text-ink-900">
                        {formatAmount(summary.defaultRate)}
                      </span>{' '}
                      when the class has none.
                    </>
                  )}{' '}
                  A shorter visit earns it pro rata, and the rate for a class is shown on your Schedule.
                </p>
              </Card>

              <Card as="section" aria-labelledby="balance-heading">
                <CardHeader title="Earnings to date" titleId="balance-heading" icon={Wallet} />
                <dl className="divide-y divide-ink-200">
                  <BalanceRow label="Earned" value={summary.balance.earned} hint="Every class taught so far" />
                  <BalanceRow label="Withdrawn" value={summary.balance.withdrawn} hint="Approved requests" />
                  <BalanceRow label="Waiting" value={summary.balance.pending} hint="Not approved yet" />
                  <BalanceRow label="Available" value={summary.balance.available} emphasis />
                </dl>
                <div className="border-t border-ink-200 p-4">
                  <Button
                    className="w-full"
                    disabled={summary.balance.available <= 0}
                    onClick={() => setFormOpen(true)}
                  >
                    <HandCoins className="size-4" aria-hidden="true" /> Request withdrawal
                  </Button>
                </div>
              </Card>

              <Card as="section" aria-labelledby="requests-heading">
                <CardHeader title="Withdrawal requests" titleId="requests-heading" />
                <WithdrawalList
                  items={requests.items}
                  emptyMessage="Ask for a withdrawal and it will be listed here with its status."
                  onCancel={setCancelTarget}
                />
                {requests.pagination && requests.pagination.totalPages > 1 && (
                  <Pagination
                    className="border-t border-ink-200 p-4"
                    pagination={requests.pagination}
                    itemCount={requests.items.length}
                    onPageChange={setPage}
                  />
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Request a withdrawal"
        description="Your administrator approves the request before it is paid out."
      >
        {summary && (
          <WithdrawalForm
            available={summary.balance.available}
            onCancel={() => setFormOpen(false)}
            onSave={requestWithdrawal}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this withdrawal?"
        message={cancelTarget && `The request for ${formatAmount(cancelTarget.amount)} will be removed.`}
        confirmLabel="Cancel request"
        confirmVariant="danger"
        isLoading={busy}
        onConfirm={cancelWithdrawal}
        onCancel={() => setCancelTarget(null)}
      />
    </>
  );
}