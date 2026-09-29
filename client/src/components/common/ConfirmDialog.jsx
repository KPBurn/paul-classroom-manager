import Button from './Button.jsx';
import Modal from './Modal.jsx';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const cancel = () => {
    if (!isLoading) onCancel();
  };

  return (
    <Modal open={open} onClose={cancel} title={title} size="max-w-md">
      <div className="text-sm text-slate-600">{message}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={cancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} isLoading={isLoading} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
