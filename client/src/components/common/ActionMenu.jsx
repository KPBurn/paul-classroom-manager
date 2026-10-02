import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * A "more actions" button that opens a small menu. `items` is a list of
 * `{ label, icon, onClick, danger?, disabled? }`; falsy items are skipped.
 */
export default function ActionMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const menuId = useId();
  const visibleItems = items.filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && containerRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!visibleItems.length) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title="More actions"
        className={`flex size-8 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 ${open ? 'bg-ink-100 text-ink-900' : ''}`}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white p-1 shadow-lg"
        >
          {visibleItems.map(({ label: itemLabel, icon: Icon, onClick, danger, disabled }) => (
            <button
              key={itemLabel}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onClick();
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition disabled:opacity-50 ${danger ? 'text-red-700 hover:bg-red-50' : 'text-ink-700 hover:bg-ink-50'}`}
            >
              {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
              {itemLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
