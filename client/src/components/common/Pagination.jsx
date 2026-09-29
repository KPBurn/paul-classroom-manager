import Button from './Button.jsx';

export default function Pagination({ pagination, itemCount, disabled = false, onPageChange, className = '' }) {
  const { page, limit, total, totalPages } = pagination;
  const first = (page - 1) * limit + 1;
  const last = first + itemCount - 1;

  return (
    <div
      className={`flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p>
        Showing {first}–{last} of {total}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
