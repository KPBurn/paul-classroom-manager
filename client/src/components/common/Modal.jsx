import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

/**
 * Accessible modal built on the native <dialog> element, which provides focus
 * trapping, Escape handling and top-layer stacking (so a confirm dialog can
 * open on top of a form dialog).
 */
export default function Modal({ open, onClose, title, description, children, size = 'max-w-lg' }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault(); // let the parent decide, e.g. block closing while saving
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose(); // click on the backdrop
      }}
      className={`m-auto w-[calc(100%-2rem)] ${size} rounded-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50`}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1.5 -mt-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
