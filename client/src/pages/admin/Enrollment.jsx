import { ClipboardList, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Alert, { ErrorState } from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card, { SectionLabel } from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import { FilterSelect, ListToolbar, SearchInput } from '../../components/common/ListFilters.jsx';
import Modal from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import { inputClass, TextAreaField } from '../../components/common/TextField.jsx';
import { ageFrom, ENROLLMENT_CHANGED_EVENT, ENROLLMENT_STATUS, formatCalendarDate, GENDER_LABELS } from '../../components/enrollment/enrollmentMeta.js';
import { classroomService } from '../../services/classroom.service.js';
import { enrollmentService } from '../../services/enrollment.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { ROLE_LABELS } from '../../utils/roles.js';
import { formatSchedule } from '../../utils/schedule.js';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Not approved' },
  { value: '', label: 'All statuses' },
];

const studentName = ({ firstName, middleName, lastName }) => [firstName, middleName, lastName].filter(Boolean).join(' ');
const classLabel = (classroom) => (classroom
  ? [classroom.subject, classroom.name].filter(Boolean).join(' / ')
  : 'Class no longer listed');

function StatusBadge({ status }) {
  const { label, tone, icon } = ENROLLMENT_STATUS[status];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

function Details({ title, rows }) {
  const shown = rows.filter(([, value]) => value);
  if (!shown.length) return null;
  return (
    <section>
      <SectionLabel as="h3">{title}</SectionLabel>
      <dl className="mt-2 divide-y divide-ink-200 rounded-lg border border-ink-200">
        {shown.map(([label, value]) => (
          <div key={label} className="grid gap-0.5 px-3 py-2 sm:grid-cols-3 sm:gap-4">
            <dt className="text-sm text-ink-500">{label}</dt>
            <dd className="wrap-break-word text-sm text-ink-900 sm:col-span-2">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The applicant's optional 2x2 photo, fetched with the administrator's credentials. */
function Photo({ applicationId }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    let created = '';
    enrollmentService.photoUrl(applicationId)
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
  }, [applicationId]);

  return url
    ? <img src={url} alt="The applicant’s 2x2 photo" className="size-28 shrink-0 rounded-lg border border-ink-200 object-cover" />
    : <div className="size-28 shrink-0 animate-pulse rounded-lg bg-ink-100" aria-hidden="true" />;
}

/** Who will be enrolled: an existing account, or one the applicant creates after approval. */
function AccountNotice({ application }) {
  const { account, kind, student } = application;
  if (kind === 'student') {
    return <Alert>This request comes from a student who already has an account. Approving adds them to the class straight away.</Alert>;
  }
  if (!account) {
    return (
      <Alert>
        No account yet. After you approve, the applicant creates their own account with the reference number, birthday
        and email. They are added to any classes you approved and choose the rest inside the portal.
      </Alert>
    );
  }
  if (account.role !== 'student') {
    return (
      <Alert tone="warning">
        {student.email} already belongs to a {ROLE_LABELS[account.role].toLowerCase()} account ({account.name}), so this
        applicant cannot be approved with it. Ask them to apply again with a different email.
      </Alert>
    );
  }
  return (
    <Alert>
      {account.linked
        ? `Linked to the student account of ${account.name}. Approved classes are added to that account.`
        : `Returning student: ${student.email} already has a student account (${account.name}). Approving adds that account to the class straight away.`}
    </Alert>
  );
}

function ReviewApplication({ application, classrooms, onDecided }) {
  const [adminNote, setAdminNote] = useState(application.adminNote);
  // The class each pending request would be approved into; it starts as the class that was asked for.
  const [targets, setTargets] = useState({});
  const [deciding, setDeciding] = useState(null);
  const [error, setError] = useState('');
  const { student, guardian } = application;
  const age = ageFrom(student.birthday);
  const blocked = application.account && application.account.role !== 'student';

  // `request` is one class of the application, or nothing for an applicant who has not chosen a class.
  const decide = async (request, status) => {
    setDeciding(`${request?.id ?? 'application'}:${status}`);
    setError('');
    try {
      const note = adminNote.trim() !== application.adminNote && { adminNote: adminNote.trim() };
      const target = request && targets[request.id];
      const updated = request
        ? await enrollmentService.decide(application.id, request.id, {
            status,
            ...(status === 'approved' && target && target !== request.classroom?.id && { classroomId: target }),
            ...note,
          })
        : await enrollmentService.decideApplication(application.id, { status, ...note });
      toast.success(request
        ? (status === 'approved' ? 'Class approved.' : 'Class request rejected.')
        : (status === 'approved' ? 'Applicant approved.' : 'Application rejected.'));
      onDecided(updated);
    } catch (decideError) {
      setError(getErrorMessage(decideError, 'Unable to save the decision.'));
    } finally {
      setDeciding(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        {application.hasPhoto ? <Photo applicationId={application.id} /> : (
          <div className="flex size-28 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink-300 text-ink-400">
            <UserRound className="size-6" aria-hidden="true" />
            <span className="text-[11px]">No photo</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-lg font-semibold text-ink-900">{studentName(student)}</p>
          <p className="wrap-break-word text-sm text-ink-600">{student.email}</p>
          <p className="mt-1 font-mono text-xs text-ink-500">{application.referenceNumber}</p>
          <p className="mt-1 text-xs text-ink-500">Submitted {formatDateTime(application.submittedAt)}</p>
        </div>
      </div>

      <AccountNotice application={application} />

      <section>
        <SectionLabel as="h3">Classes requested</SectionLabel>
        {application.requests.length === 0 && (
          <div className="mt-2 rounded-lg border border-ink-200 p-3">
            <p className="text-sm text-ink-700">
              No class chosen. {application.status === 'rejected'
                ? 'This application was not approved.'
                : 'Once approved, the student creates their account and requests their classes inside the portal; each request comes back here for your decision.'}
            </p>
            {application.status === 'pending' && (
              <div className="mt-3 flex justify-end gap-2 border-t border-ink-200 pt-3">
                <Button
                  variant="secondary"
                  isLoading={deciding === 'application:rejected'}
                  disabled={Boolean(deciding)}
                  onClick={() => decide(null, 'rejected')}
                >
                  Reject
                </Button>
                <Button
                  isLoading={deciding === 'application:approved'}
                  disabled={Boolean(deciding) || blocked}
                  onClick={() => decide(null, 'approved')}
                >
                  Approve applicant
                </Button>
              </div>
            )}
          </div>
        )}
        <ul className="mt-2 space-y-2">
          {application.requests.map((request) => {
            const pending = request.status === 'pending';
            const target = targets[request.id] ?? request.classroom?.id ?? '';
            // A class that was archived after the request is no longer a choice.
            const options = classrooms.filter((classroom) => !application.requests.some((other) => (
              other.id !== request.id && other.classroom?.id === classroom.id
            )));
            return (
              <li key={request.id} className="rounded-lg border border-ink-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{classLabel(request.classroom)}</p>
                    <p className="text-xs text-ink-500">
                      {formatSchedule(request.classroom?.schedule)}
                      {request.classroom?.teachers?.length > 0 && ` · ${request.classroom.teachers.map((teacher) => teacher.name).join(', ')}`}
                    </p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                {pending && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-ink-200 pt-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`target-${request.id}`} className="mb-1 block text-xs font-medium text-ink-600">Approve into</label>
                      <select
                        id={`target-${request.id}`}
                        value={target}
                        onChange={(event) => setTargets((current) => ({ ...current, [request.id]: event.target.value }))}
                        className={inputClass(false, 'h-10 pr-8')}
                      >
                        {!options.some((classroom) => classroom.id === target) && <option value="">Choose a class</option>}
                        {options.map((classroom) => (
                          <option key={classroom.id} value={classroom.id}>
                            {classLabel(classroom)}{classroom.id === request.classroom?.id ? ' (requested)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        isLoading={deciding === `${request.id}:rejected`}
                        disabled={Boolean(deciding)}
                        onClick={() => decide(request, 'rejected')}
                      >
                        Reject
                      </Button>
                      <Button
                        isLoading={deciding === `${request.id}:approved`}
                        disabled={Boolean(deciding) || blocked || !options.some((classroom) => classroom.id === target)}
                        onClick={() => decide(request, 'approved')}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {error && <Alert tone="error">{error}</Alert>}

      {application.status === 'pending' ? (
        <div>
          <TextAreaField
            id="admin-note"
            label="Message to the student (optional)"
            rows={2}
            maxLength={500}
            count={adminNote.length}
            placeholder="For example, why a class was not approved"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
          />
          <p className="mt-1 text-xs text-ink-500">Saved with your next decision. The student sees it when they check their status.</p>
        </div>
      ) : (
        <Details title="Your message to the student" rows={[['Message', application.adminNote]]} />
      )}

      {application.note && <Details title="Note from the student" rows={[['Note', application.note]]} />}
      <Details
        title="Student"
        rows={[
          ['Birthday', student.birthday && `${formatCalendarDate(student.birthday)}${age === null ? '' : ` (age ${age})`}`],
          ['Gender', GENDER_LABELS[student.gender]],
          ['Contact number', student.contactNumber],
          ['Address', student.address],
        ]}
      />
      <Details
        title="Parent or guardian"
        rows={[
          ['Name', guardian?.name],
          ['Relationship', guardian?.relationship],
          ['Contact number', guardian?.contactNumber],
          ['Email', guardian?.email],
        ]}
      />
    </div>
  );
}

export default function Enrollment() {
  const [filters, setFilters] = useState({ search: '', status: 'pending', classroomId: '' });
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ state: 'loading', items: [], pagination: null, error: '' });
  const [classrooms, setClassrooms] = useState([]);
  const [reviewingId, setReviewingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    classroomService.list().then(setClassrooms).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setList((current) => ({ ...current, state: 'loading' }));
    enrollmentService.list({ page, limit: PAGE_SIZE, ...filters })
      .then(({ items, pagination }) => {
        if (!cancelled) setList({ state: 'ready', items, pagination, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setList({ state: 'error', items: [], pagination: null, error: getErrorMessage(error, 'Unable to load applications.') });
      });
    return () => {
      cancelled = true;
    };
  }, [page, filters, reloadKey]);

  const updateFilters = useCallback((changes) => {
    setFilters((current) => ({ ...current, ...changes }));
    setPage(1);
  }, []);

  useEffect(() => {
    const search = searchText.trim();
    if (search === filters.search) return undefined;
    const timer = setTimeout(() => updateFilters({ search }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchText, filters.search, updateFilters]);

  const reviewing = list.items.find((item) => item.id === reviewingId);
  const onDecided = (updated) => {
    // Keep the open application on screen with its new state; the list is brought up to date when it closes.
    setList((current) => ({ ...current, items: current.items.map((item) => (item.id === updated.id ? updated : item)) }));
    window.dispatchEvent(new Event(ENROLLMENT_CHANGED_EVENT));
  };
  const closeReview = () => {
    setReviewingId(null);
    setReloadKey((key) => key + 1);
  };
  const hasFilters = Boolean(filters.search || filters.classroomId || filters.status !== 'pending');

  return (
    <>
      <PageHeader
        title="Enrollment"
        description="Requests from applicants and students to join a class. Approve or reject each class, or place the student in a different one."
      />

      <ListToolbar count={list.pagination?.total} noun="application">
        <SearchInput
          id="enrollment-search"
          label="Search applications"
          value={searchText}
          onChange={setSearchText}
          placeholder="Search by name, email or reference number"
          maxLength={100}
          className="sm:w-80"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <FilterSelect id="enrollment-status" label="Status" value={filters.status} onChange={(status) => updateFilters({ status })} options={STATUS_OPTIONS} className="sm:w-40" />
          <FilterSelect
            id="enrollment-class"
            label="Class"
            value={filters.classroomId}
            onChange={(classroomId) => updateFilters({ classroomId })}
            options={[{ value: '', label: 'All classes' }, ...classrooms.map((classroom) => ({ value: classroom.id, label: classLabel(classroom) }))]}
            className="sm:w-56"
          />
        </div>
      </ListToolbar>

      {list.state === 'error' ? (
        <ErrorState message={list.error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : list.state === 'loading' && list.items.length === 0 ? (
        <PageLoader label="Loading applications…" />
      ) : list.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={hasFilters ? 'No matching applications' : 'No applications are waiting'}
          message={hasFilters
            ? 'Try a different search, status or class.'
            : 'New requests appear here when someone applies for a class from the enrollment page.'}
        />
      ) : (
        <Card className={`overflow-hidden transition-opacity ${list.state === 'loading' ? 'opacity-60' : ''}`}>
          <ul className="divide-y divide-ink-200">
            {list.items.map((application) => (
              <li key={application.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-900">{studentName(application.student)}</p>
                    <StatusBadge status={application.status} />
                    <Badge>{application.kind === 'student' || application.account?.role === 'student' ? 'Current student' : 'New applicant'}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink-500">
                    {application.student.email} · {formatDateTime(application.submittedAt)}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {application.requests.length === 0 && (
                      <li className="rounded-md bg-ink-100 px-2 py-0.5 text-xs text-ink-500">No class chosen yet</li>
                    )}
                    {application.requests.map((request) => {
                      const { icon: Icon, label } = ENROLLMENT_STATUS[request.status];
                      return (
                        <li key={request.id} className="flex items-center gap-1.5 rounded-md bg-ink-100 px-2 py-0.5 text-xs text-ink-700" title={label}>
                          <Icon className="size-3 shrink-0 text-ink-500" aria-hidden="true" />
                          {classLabel(request.classroom)}
                          <span className="sr-only"> – {label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <Button
                  variant={application.status === 'pending' ? 'primary' : 'secondary'}
                  size="sm"
                  className="shrink-0"
                  onClick={() => setReviewingId(application.id)}
                >
                  {application.status === 'pending' ? 'Review' : 'View'}
                </Button>
              </li>
            ))}
          </ul>
          <Pagination
            className="border-t border-ink-200 px-5 py-3"
            pagination={list.pagination}
            itemCount={list.items.length}
            disabled={list.state === 'loading'}
            onPageChange={setPage}
          />
        </Card>
      )}

      <Modal open={Boolean(reviewing)} onClose={closeReview} title="Enrollment request" size="max-w-2xl">
        {reviewing && (
          <ReviewApplication
            key={reviewing.id}
            application={reviewing}
            classrooms={classrooms}
            onDecided={onDecided}
          />
        )}
      </Modal>
    </>
  );
}
