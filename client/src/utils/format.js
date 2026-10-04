const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatDateTime = (value) => dateTimeFormat.format(new Date(value));

// The class rate has no currency attached, so an amount is a plain two-decimal number.
const amountFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatAmount = (value) => amountFormat.format(Number(value ?? 0));

/** Time spent in class: "45 min", or "1 h 05 min". */
export function formatDuration(milliseconds = 0) {
  const minutes = Math.max(0, Math.round(Number(milliseconds) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** How much of a class was attended, as a percentage. */
export const formatPercent = (share) => `${Math.round(Number(share ?? 0) * 100)}%`;
