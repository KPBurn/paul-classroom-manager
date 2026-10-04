import Badge from '../common/Badge.jsx';
import Button from '../common/Button.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { formatAmount, formatDateTime } from '../../utils/format.js';

export const WITHDRAWAL_METHOD_LABELS = {
  cash: 'Cash',
  'bank-transfer': 'Bank transfer',
  other: 'Other',
};

export const WITHDRAWAL_STATUS_LABELS = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_TONES = { pending: 'warning', approved: 'success', rejected: 'danger' };

export function WithdrawalStatusPill({ status }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{WITHDRAWAL_STATUS_LABELS[status] ?? status}</Badge>
  );
}

/**
 * Withdrawal requests, newest first. `onReview` adds the administrator's approve
 * and reject actions; `onCancel` adds the cancel action for a waiting request.
 */
export default function WithdrawalList({ items, emptyMessage, onCancel, onReview }) {
  if (!items.length) {
    return <EmptyState className="border-0" title="No withdrawal requests" message={emptyMessage} />;
  }

  return (
    <ul className="divide-y divide-ink-200">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
              {item.teacher && <span className="truncate">{item.teacher.name}</span>}
              <WithdrawalStatusPill status={item.status} />
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              Requested {formatDateTime(item.requestedAt)}
              {' · '}
              {WITHDRAWAL_METHOD_LABELS[item.method] ?? item.method}
              {item.note && ` · ${item.note}`}
              {item.reviewNote && ` · ${item.reviewNote}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <p className="mr-1 text-sm font-medium tabular-nums text-ink-900">{formatAmount(item.amount)}</p>
            {item.status === 'pending' && onReview && (
              <>
                <Button size="sm" variant="secondary" onClick={() => onReview(item, 'approved')}>Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => onReview(item, 'rejected')}>Reject</Button>
              </>
            )}
            {item.status === 'pending' && onCancel && (
              <Button size="sm" variant="ghost" onClick={() => onCancel(item)}>Cancel</Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}