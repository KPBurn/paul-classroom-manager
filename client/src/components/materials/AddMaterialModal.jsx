import { Paperclip, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import TextField, { SelectField, TextAreaField } from '../common/TextField.jsx';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatFileSize } from '../../utils/fileDownloads.js';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const NEW_SUBJECT = '__new__';
const localDateTimeValue = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const inputClass = 'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

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
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Attachment</span>
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              {previewUrl ? (
                <img src={previewUrl} alt="" className="size-14 shrink-0 rounded-md border border-slate-200 object-cover" />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-white text-indigo-600">
                  <Paperclip className="size-5" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{file.name}</span>
                <span className="text-xs text-slate-500">{formatFileSize(file.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => chooseFile(null)}
                className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900"
                aria-label="Remove attachment"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label
              htmlFor={fileInputId}
              className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40"
            >
              <Paperclip className="size-5 text-indigo-600" aria-hidden="true" />
              <span className="text-sm font-medium text-slate-900">Choose a file or image</span>
              <span className="text-xs text-slate-500">PDF, Word, PowerPoint, spreadsheets, images and more · up to 8 MB</span>
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

        <label className="block text-sm font-medium text-slate-700">
          Available to students from <span className="font-normal text-slate-400">(optional)</span>
          <input
            type="datetime-local"
            min={localDateTimeValue(new Date())}
            value={availableAt}
            onChange={(event) => setAvailableAt(event.target.value)}
            className={`${inputClass} sm:max-w-xs`}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">Leave blank to share it right away.</span>
        </label>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" isLoading={saving}>Add material</Button>
        </div>
      </form>
    </Modal>
  );
}
