import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Alert from '../common/Alert.jsx';
import Badge from '../common/Badge.jsx';
import Button from '../common/Button.jsx';
import Card, { CardHeader } from '../common/Card.jsx';
import Modal, { ModalActions } from '../common/Modal.jsx';
import { PageLoader } from '../common/Spinner.jsx';
import { TextAreaField } from '../common/TextField.jsx';
import { enrollmentService } from '../../services/enrollment.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { formatSchedule } from '../../utils/schedule.js';
import ClassPicker from './ClassPicker.jsx';
import { ENROLLMENT_STATUS } from './enrollmentMeta.js';

function RequestForm({ classes, enrolledIds, waitingIds, onCancel, onSent }) {
  const [classroomIds, setClassroomIds] = useState([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (classroomIds.length === 0) {
      setError('Choose at least one class.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await enrollmentService.requestClasses({ classroomIds, note });
      toast.success('Request sent. Your school will review it.');
      onSent();
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'Unable to send your request.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <ClassPicker
        classes={classes}
        selectedIds={classroomIds}
        onChange={setClassroomIds}
        disabledReason={(item) => (enrolledIds.includes(item.id)
          ? 'You are already in this class'
          : waitingIds.includes(item.id) ? 'Waiting for a decision' : undefined)}
      />
      <TextAreaField
        id="request-note"
        label="Note to the school (optional)"
        rows={2}
        maxLength={500}
        count={note.length}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <ModalActions>
        <Button variant="secondary" onClick={onCancel} disabled={sending}>Cancel</Button>
        <Button type="submit" isLoading={sending}>Send request</Button>
      </ModalActions>
    </form>
  );
}

/**
 * Lets a signed-in student ask to join another class, and shows what became of
 * earlier requests. The school decides; nothing here adds the student to a class.
 */
export default function ClassRequests({ enrolledIds }) {
  const [requests, setRequests] = useState([]);
  const [classes, setClasses] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRequests(await enrollmentService.ownRequests());
      setError('');
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your class requests.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = async () => {
    setOpen(true);
    try {
      setClasses(await enrollmentService.classes());
    } catch (loadError) {
      setOpen(false);
      toast.error(getErrorMessage(loadError, 'Unable to load the classes.'));
    }
  };

  const rows = requests.flatMap((application) => application.requests.map((request) => ({ ...request, application })));
  const waitingIds = rows.filter((row) => row.status === 'pending').map((row) => row.classroom?.id);

  return (
    <Card as="section" className="mt-6" aria-labelledby="class-requests-heading">
      <CardHeader
        title="Class requests"
        titleId="class-requests-heading"
        action={(
          <Button size="sm" onClick={openForm}>
            <Plus className="size-4" aria-hidden="true" />
            Request a class
          </Button>
        )}
      />
      {error ? (
        <div className="p-5"><Alert tone="error">{error}</Alert></div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-500">
          Want to join another class? Send a request and your school will review it.
        </p>
      ) : (
        <ul className="divide-y divide-ink-200">
          {rows.map((row) => {
            const { label, tone, icon } = ENROLLMENT_STATUS[row.status];
            return (
              <li key={row.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">
                    {[row.classroom?.subject, row.classroom?.name ?? 'Class no longer listed'].filter(Boolean).join(' / ')}
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatSchedule(row.classroom?.schedule)} · Requested {formatDateTime(row.application.submittedAt)}
                  </p>
                  {row.status !== 'pending' && row.application.adminNote && (
                    <p className="mt-1 text-xs text-ink-600">Note from your school: {row.application.adminNote}</p>
                  )}
                </div>
                <Badge tone={tone} icon={icon}>{label}</Badge>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Request a class"
        description="Choose the classes you want to join. Your school decides each one."
        size="max-w-2xl"
      >
        {open && (classes ? (
          <RequestForm
            classes={classes}
            enrolledIds={enrolledIds}
            waitingIds={waitingIds}
            onCancel={() => setOpen(false)}
            onSent={() => {
              setOpen(false);
              load();
            }}
          />
        ) : <PageLoader label="Loading classes…" className="py-8" />)}
      </Modal>
    </Card>
  );
}
