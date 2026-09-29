import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import TextField, { TextAreaField } from '../common/TextField.jsx';

// Keep in sync with ANNOUNCEMENT_LIMITS in server/src/models/Announcement.js.
export const ANNOUNCEMENT_LIMITS = { title: 120, body: 2000, type: 30 };
const SUGGESTED_TYPES = ['General', 'Academic', 'Event', 'Holiday', 'Reminder', 'Urgent', 'Homework'];

const text = (label, max) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

const announcementSchema = z.object({
  title: text('Title', ANNOUNCEMENT_LIMITS.title),
  body: text('Body', ANNOUNCEMENT_LIMITS.body),
  type: text('Type', ANNOUNCEMENT_LIMITS.type),
});

const EMPTY_FORM = { title: '', body: '', type: '' };

/**
 * Create or edit an announcement. `onSubmit` receives the validated values;
 * the form stays open (keeping the text) when it throws.
 */
export default function AnnouncementFormModal({
  open,
  onClose,
  onSubmit,
  initialValues,
  title,
  description,
  submitLabel = 'Save',
  isSaving = false,
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({ resolver: zodResolver(announcementSchema), defaultValues: EMPTY_FORM });
  const [titleValue, body, type] = watch(['title', 'body', 'type']);

  useEffect(() => {
    if (open) reset(initialValues ? { title: initialValues.title, body: initialValues.body, type: initialValues.type } : EMPTY_FORM);
  }, [open, initialValues, reset]);

  const close = () => {
    if (!isSaving) onClose();
  };

  return (
    <Modal open={open} onClose={close} title={title} description={description} size="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <TextField
          id="announcement-title"
          label="Title"
          maxLength={ANNOUNCEMENT_LIMITS.title}
          count={titleValue.length}
          placeholder="e.g. Quiz on Friday"
          error={errors.title?.message}
          {...register('title')}
        />

        <TextField
          id="announcement-type"
          label="Type"
          list="announcement-types"
          maxLength={ANNOUNCEMENT_LIMITS.type}
          count={type.length}
          placeholder="Pick a suggestion or type your own"
          autoComplete="off"
          error={errors.type?.message}
          {...register('type')}
        />
        <datalist id="announcement-types">
          {SUGGESTED_TYPES.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>

        <TextAreaField
          id="announcement-body"
          label="Body"
          rows={8}
          maxLength={ANNOUNCEMENT_LIMITS.body}
          count={body.length}
          placeholder="Write the announcement…"
          error={errors.body?.message}
          {...register('body')}
        />

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>{submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
