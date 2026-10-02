import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { IconButton } from './Button.jsx';

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
      className={`m-auto w-[calc(100%-2rem)] ${size} rounded-2xl border border-ink-200 bg-white p-0 text-ink-900 shadow-xl`}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
            </div>
            <IconButton label="Close" icon={X} onClick={onClose} className="-mr-1.5 -mt-1" />
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** The button row at the bottom of a form in a dialog. */
export function ModalActions({ children, className = '' }) {
  return (
    <div className={`flex flex-col-reverse gap-2 border-t border-ink-200 pt-4 sm:flex-row sm:justify-end ${className}`}>
      {children}
    </div>
  );
}
