import { Paperclip, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import Alert from '../common/Alert.jsx';
import Button, { IconButton } from '../common/Button.jsx';
import Modal, { ModalActions } from '../common/Modal.jsx';
import TextField, { inputClass, labelClass, SelectField, TextAreaField } from '../common/TextField.jsx';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatFileSize } from '../../utils/fileDownloads.js';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const NEW_SUBJECT = '__new__';
const localDateTimeValue = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/**
 * Add a learning material to one of the classroom's subjects (or a new one):
 * a file or image with an optional title, description and release time.
 */
export default function AddMaterialModal({ open, onClose, classroomId, subjects, onAdded }) {
  const fileInputId = useId();
  const [subjectId, setSubjectId] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [availableAt, setAvailableAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSubjectId(subjects[0]?.id ?? NEW_SUBJECT);
    setSubjectName('');
    setTitle('');
    setDescription('');
    setFile(null);
    setAvailableAt('');
    setError('');
  }, [open, subjects]);

  useEffect(() => {
    if (!file?.type.startsWith('image/')) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const chooseFile = (chosen) => {
    setError('');
    if (chosen && chosen.size > MAX_FILE_SIZE) {
      setError('Files must be 8 MB or smaller.');
      setFile(null);
      return;
    }
    setFile(chosen ?? null);
  };

  const close = () => {
    if (!saving) onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Choose a file or image to attach.');
      return;
    }
    if (subjectId === NEW_SUBJECT && !subjectName.trim()) {
      setError('Enter a name for the new subject.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let targetId = subjectId;
      if (subjectId === NEW_SUBJECT) {
        targetId = (await subjectService.create({ name: subjectName.trim(), classroomId })).id;
      }
      await subjectService.uploadMaterial(targetId, file, {
        title: title.trim(),
        description: description.trim(),
        availableAt: availableAt ? new Date(availableAt).toISOString() : undefined,
      });
      toast.success('Material added.');
      onAdded();
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to add this material.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Add material" description="Students in this class can view and download it." size="max-w-2xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}

        <div className="group">
          <span className={`mb-1.5 ${labelClass}`}>Attachment</span>
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-ink-300 p-2">
              {previewUrl ? (
                <img src={previewUrl} alt="" className="size-12 shrink-0 rounded-md border border-ink-200 object-cover" />
              ) : (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-500">
                  <Paperclip className="size-5" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-900">{file.name}</span>
                <span className="text-xs text-ink-500">{formatFileSize(file.size)}</span>
              </span>
              <IconButton label="Remove attachment" icon={X} onClick={() => chooseFile(null)} />
            </div>
          ) : (
            <label
              htmlFor={fileInputId}
              className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink-300 px-4 py-6 text-center transition hover:border-ink-500 hover:bg-ink-50 group-has-[input:focus-visible]:outline-2 group-has-[input:focus-visible]:outline-offset-2 group-has-[input:focus-visible]:outline-accent-600"
            >
              <Paperclip className="size-5 text-ink-400" aria-hidden="true" />
              <span className="text-sm font-medium text-ink-900">Choose a file or image</span>
              <span className="text-xs text-ink-500">PDF, Word, PowerPoint, spreadsheets, images and more · up to 8 MB</span>
            </label>
          )}
          <input
            id={fileInputId}
            type="file"
            className="sr-only"
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="material-subject"
            label="Subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            options={[
              ...subjects.map((subject) => ({ value: subject.id, label: subject.name })),
              { value: NEW_SUBJECT, label: '+ New subject…' },
            ]}
          />
          {subjectId === NEW_SUBJECT ? (
            <TextField
              id="material-new-subject"
              label="New subject name"
              value={subjectName}
              maxLength={120}
              onChange={(event) => setSubjectName(event.target.value)}
              placeholder="e.g. English 101"
            />
          ) : (
            <TextField
              id="material-title"
              label="Title (optional)"
              value={title}
              maxLength={180}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={file ? file.name : 'Defaults to the file name'}
            />
          )}
        </div>
        {subjectId === NEW_SUBJECT && (
          <TextField
            id="material-title-new"
            label="Title (optional)"
            value={title}
            maxLength={180}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={file ? file.name : 'Defaults to the file name'}
          />
        )}

        <TextAreaField
          id="material-description"
          label="Description (optional)"
          rows={3}
          maxLength={1000}
          count={description.length}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Instructions or notes for students"
        />

        <label className={labelClass}>
          Available to students from (optional)
          <input
            type="datetime-local"
            min={localDateTimeValue(new Date())}
            value={availableAt}
            onChange={(event) => setAvailableAt(event.target.value)}
            className={inputClass(false, 'mt-1.5 font-normal sm:max-w-xs')}
          />
          <span className="mt-1 block text-xs font-normal text-ink-500">Leave blank to share it right away.</span>
        </label>

        <ModalActions>
          <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" isLoading={saving}>Add material</Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
