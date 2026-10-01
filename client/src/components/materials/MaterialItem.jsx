import { CalendarClock, Download, Eye, FileArchive, FileImage, FileSpreadsheet, FileText, File as FileIcon, Presentation, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import Spinner from '../common/Spinner.jsx';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatFileSize, saveBlob } from '../../utils/fileDownloads.js';

// Matches PREVIEWABLE_CONTENT_TYPES on the server; other types are download-only.
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const isImage = (material) => IMAGE_TYPES.has(material.contentType);
const isPdf = (material) => material.contentType === 'application/pdf';
export const canPreview = (material) => isImage(material) || isPdf(material);

function typeIcon(material) {
  const name = material.name.toLowerCase();
  if (isImage(material) || material.contentType?.startsWith('image/')) return FileImage;
  if (isPdf(material) || /\.(docx?|txt|rtf|odt)$/.test(name)) return FileText;
  if (/\.(xlsx?|csv|ods)$/.test(name)) return FileSpreadsheet;
  if (/\.(pptx?|odp|key)$/.test(name)) return Presentation;
  if (/\.(zip|rar|7z)$/.test(name)) return FileArchive;
  return FileIcon;
}

const formatDateTime = (value) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** Loads a material into a temporary object URL (with a safe preview type) while `enabled`. */
function useMaterialUrl(subjectId, material, enabled) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let objectUrl = null;
    let cancelled = false;
    setFailed(false);
    subjectService.downloadMaterial(subjectId, material.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: material.contentType }));
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [subjectId, material.id, material.contentType, enabled]);

  return { url, failed };
}

function Thumbnail({ subjectId, material, available }) {
  const showImage = isImage(material) && available;
  const { url } = useMaterialUrl(subjectId, material, showImage);
  const Icon = typeIcon(material);

  if (showImage && url) {
    return <img src={url} alt="" className="size-12 shrink-0 rounded-lg border border-slate-200 object-cover" />;
  }
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

function PreviewDialog({ subjectId, material, onClose, onDownload }) {
  const { url, failed } = useMaterialUrl(subjectId, material ?? { id: null }, Boolean(material));
  return (
    <Modal open={Boolean(material)} onClose={onClose} title={material ? material.title || material.name : ''} size="max-w-4xl">
      {material && (
        <>
          <div className="flex min-h-64 items-center justify-center rounded-lg bg-slate-100">
            {failed ? (
              <p className="p-6 text-sm text-slate-600">This file could not be previewed. Download it instead.</p>
            ) : !url ? (
              <Spinner className="size-6 text-indigo-600" />
            ) : isImage(material) ? (
              <img src={url} alt={material.title || material.name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
            ) : (
              <iframe src={url} title={material.title || material.name} className="h-[70vh] w-full rounded-lg bg-white" />
            )}
          </div>
          {material.description && <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{material.description}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={onDownload}><Download className="size-4" aria-hidden="true" /> Download</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/**
 * One material with its attachment: an image thumbnail or file-type icon,
 * details, and View, Download and (for teachers) Delete actions.
 */
export default function MaterialItem({ subjectId, material, now, onDelete, showUploader = true }) {
  const available = new Date(material.availableAt).getTime() <= now;
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // Teachers can always open their own uploads; students only once the material is released.
  const openable = available || Boolean(onDelete);

  const download = async () => {
    setDownloading(true);
    try {
      saveBlob(await subjectService.downloadMaterial(subjectId, material.id), material.name);
    } catch (downloadError) {
      toast.error(getErrorMessage(downloadError, 'Unable to download this material.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Thumbnail subjectId={subjectId} material={material} available={openable} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{material.title || material.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {material.title && <>{material.name} · </>}
            {formatFileSize(material.size)}
            {showUploader && material.uploader?.name && <> · {material.uploader.name}</>}
          </p>
          {material.description && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{material.description}</p>}
          {!available && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <CalendarClock className="size-3" aria-hidden="true" /> Available {formatDateTime(material.availableAt)}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-15 sm:pl-0">
        {canPreview(material) && (
          <Button variant="secondary" size="sm" disabled={!openable} onClick={() => setPreviewing(true)}>
            <Eye className="size-3.5" aria-hidden="true" /> View
          </Button>
        )}
        <Button variant="secondary" size="sm" disabled={!openable} isLoading={downloading} onClick={download}>
          <Download className="size-3.5" aria-hidden="true" /> Download
        </Button>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(material)}
            className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-indigo-600"
            aria-label={`Delete ${material.title || material.name}`}
            title="Delete"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <PreviewDialog
        subjectId={subjectId}
        material={previewing ? material : null}
        onClose={() => setPreviewing(false)}
        onDownload={download}
      />
    </li>
  );
}
