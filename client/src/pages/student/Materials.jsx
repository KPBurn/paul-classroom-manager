import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CalendarClock, Download, Paperclip, School } from 'lucide-react';
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

export default function StudentMaterials() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSubjects(await subjectService.list());
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your subject materials.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const download = async (subjectId, material) => {
    setDownloadingId(material.id);
    setError('');
    try {
      saveBlob(await subjectService.downloadMaterial(subjectId, material.id), material.name);
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, 'Unable to download this material.'));
    } finally {
      setDownloadingId('');
    }
  };

  return (
    <>
      <PageHeader
        title="Subject Materials"
        description="Download files shared with the active classes you belong to. Scheduled materials unlock automatically."
      />
      {error && <div className="mb-5"><Alert tone="error">{error}</Alert></div>}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : subjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <BookOpen className="mx-auto size-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-slate-900">No subjects assigned yet</h2>
          <p className="mt-1 text-sm text-slate-500">Materials will appear here when your teacher creates a subject for your class.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {subjects.map((subject) => (
            <section key={subject.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <header className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-semibold text-slate-900">{subject.name}</h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <School className="size-4" aria-hidden="true" />
                  {subject.classroom.name}
                </p>
                {subject.description && <p className="mt-2 text-sm text-slate-600">{subject.description}</p>}
              </header>
              {subject.materials.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">No materials have been uploaded yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {subject.materials.map((material) => {
                    const available = new Date(material.availableAt).getTime() <= now;
                    return (
                      <li key={material.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <Paperclip className="mt-0.5 size-4 shrink-0 text-indigo-600" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="break-all text-sm font-medium text-slate-900">{material.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatFileSize(material.size)} · Shared by {material.uploader?.name || 'your teacher'}
                            </p>
                            <p className={`mt-1 flex items-center gap-1 text-xs ${available ? 'text-emerald-700' : 'text-amber-700'}`}>
                              <CalendarClock className="size-3.5" aria-hidden="true" />
                              {available ? 'Available to download' : `Available ${formatDateTime(material.availableAt)}`}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          disabled={!available}
                          isLoading={downloadingId === material.id}
                          onClick={() => download(subject.id, material)}
                          className="shrink-0"
                        >
                          <Download className="size-4" aria-hidden="true" />
                          {available ? 'Download' : 'Not available yet'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
