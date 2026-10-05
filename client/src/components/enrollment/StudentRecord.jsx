import { UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ageFrom, formatCalendarDate, GENDER_LABELS } from './enrollmentMeta.js';

/** The 2x2 photo from an enrollment record. `load` returns an object URL, fetched with the reader's credentials. */
function RecordPhoto({ load }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    let created = '';
    load()
      .then((objectUrl) => {
        created = objectUrl;
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [load]);

  return url
    ? <img src={url} alt="2x2 photo" className="size-24 shrink-0 rounded-lg border border-ink-200 object-cover" />
    : <div className="size-24 shrink-0 animate-pulse rounded-lg bg-ink-100" aria-hidden="true" />;
}

/**
 * What a student gave when they applied for enrollment: their own details and
 * their parent or guardian's. `loadPhoto` must be a stable function.
 */
export default function StudentRecord({ record, loadPhoto }) {
  const { student, guardian } = record;
  const age = ageFrom(student.birthday);
  const rows = [
    ['Birthday', student.birthday && `${formatCalendarDate(student.birthday)}${age === null ? '' : ` (age ${age})`}`],
    ['Gender', GENDER_LABELS[student.gender]],
    ['Contact number', student.contactNumber],
    ['Address', student.address],
    ['Parent or guardian', guardian?.name && `${guardian.name}${guardian.relationship ? ` (${guardian.relationship})` : ''}`],
    ['Guardian’s contact number', guardian?.contactNumber],
    ['Guardian’s email', guardian?.email],
    ['Reference number', record.referenceNumber],
  ].filter(([, value]) => value);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {record.hasPhoto ? <RecordPhoto load={loadPhoto} /> : (
        <div className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink-300 text-ink-400">
          <UserRound className="size-5" aria-hidden="true" />
          <span className="text-[11px]">No photo</span>
        </div>
      )}
      <dl className="min-w-0 flex-1 divide-y divide-ink-200 rounded-lg border border-ink-200">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-0.5 px-3 py-2 sm:grid-cols-3 sm:gap-4">
            <dt className="text-sm text-ink-500">{label}</dt>
            <dd className="wrap-break-word text-sm text-ink-900 sm:col-span-2">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
