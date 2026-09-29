import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Download, FileUp, Paperclip, School } from 'lucide-react';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { subjectService } from '../../services/subject.service.js';
import { formatFileSize, saveBlob } from '../../utils/fileDownloads.js';
import { getErrorMessage } from '../../utils/errors.js';

const formatDateTime = (value) => new Date(value).toLocaleString([], {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const localDateTimeValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export default function SubjectDashboard() {
  const { id } = useParams();
  const [subject, setSubject] = useState(null);
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [availableAt, setAvailableAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSubject(await subjectService.get(id));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load this subject.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const upload = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Files must be 8 MB or smaller.');
      return;
    }

    setUploading(true);
    setError('');
    try {
      await subjectService.uploadMaterial(id, file, availableAt ? new Date(availableAt).toISOString() : undefined);
      setFile(null);
      setFileInputKey((current) => current + 1);
      setAvailableAt('');
      await load();
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, 'Unable to upload this material.'));
    } finally {
      setUploading(false);
    }
  };

  const download = async (material) => {
    setDownloadingId(material.id);
    setError('');
    try {
      saveBlob(await subjectService.downloadMaterial(id, material.id), material.name);
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, 'Unable to download this material.'));
    } finally {
      setDownloadingId('');
    }
  };

  return (
    <>
      <div className="mb-4">
        <Link to="/teacher/subjects" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-800">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All subjects
        </Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : error && !subject ? (
        <Alert tone="error">{error}</Alert>
      ) : subject ? (
        <>
          <PageHeader
            title={subject.name}
            description={subject.description || 'Subject dashboard and class learning materials.'}
          />
          <div className="mb-6 flex items-center gap-2 text-sm text-slate-600">
            <School className="size-4 text-slate-400" aria-hidden="true" />
            <span>Class / batch: <strong className="font-medium text-slate-800">{subject.classroom.name}</strong></span>
          </div>

          {error && <div className="mb-5"><Alert tone="error">{error}</Alert></div>}

          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <FileUp className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Upload a material</h2>
                <p className="text-sm text-slate-500">PDFs and other file types up to 8 MB are supported.</p>
              </div>
            </div>
            <form onSubmit={upload} className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                Choose file
                <input
                  key={fileInputKey}
                  required
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-700"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Make available to students
                <input
                  type="datetime-local"
                  min={localDateTimeValue(new Date())}
                  value={availableAt}
                  onChange={(event) => setAvailableAt(event.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Leave blank to make it available immediately.
                </span>
              </label>
              <div className="flex items-end">
                <Button type="submit" isLoading={uploading} disabled={!file}>
                  Upload material
                </Button>
              </div>
            </form>
          </section>

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Class materials</h2>
          {subject.materials.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <Paperclip className="mx-auto size-8 text-slate-400" aria-hidden="true" />
              <h3 className="mt-3 font-semibold text-slate-900">No materials uploaded yet</h3>
              <p className="mt-1 text-sm text-slate-500">Files you add here will appear in this class’s student materials area.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {subject.materials.map((material) => {
                const available = new Date(material.availableAt).getTime() <= now;
                return (
                  <li key={material.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <Paperclip className="mt-0.5 size-4 shrink-0 text-indigo-600" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium text-slate-900">{material.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatFileSize(material.size)} · {material.uploader?.name || 'Teacher'}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <CalendarClock className="size-3.5" aria-hidden="true" />
                          {available ? 'Available to students' : `Available ${formatDateTime(material.availableAt)}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      isLoading={downloadingId === material.id}
                      onClick={() => download(material)}
                      className="shrink-0"
                    >
                      <Download className="size-4" aria-hidden="true" />
                      Download
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </>
  );
}
