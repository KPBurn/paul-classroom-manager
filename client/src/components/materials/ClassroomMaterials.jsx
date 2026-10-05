import { Paperclip, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Alert from '../common/Alert.jsx';
import Button from '../common/Button.jsx';
import Card, { SectionLabel } from '../common/Card.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { FilterSelect } from '../common/ListFilters.jsx';
import { PageLoader } from '../common/Spinner.jsx';
import { useNow } from '../../hooks/useNow.js';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import AddMaterialModal from './AddMaterialModal.jsx';
import MaterialItem from './MaterialItem.jsx';
import { useLiveData } from '../../context/LiveSessionsContext.jsx';

/**
 * Learning materials for one classroom, grouped by subject. Teachers can add
 * and delete materials; everyone in the class can view and download them.
 */
export default function ClassroomMaterials({ classroomId, canManage, archived }) {
  const now = useNow();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const all = await subjectService.list();
      setSubjects(all.filter((subject) => subject.classroom?.id === classroomId));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load materials.'));
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveData(['materials'], load);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await subjectService.deleteMaterial(deleting.subjectId, deleting.material.id);
      toast.success('Material deleted.');
      setDeleting(null);
      await load();
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, 'Unable to delete this material.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const shownSubjects = subjects.filter((subject) => !subjectFilter || subject.id === subjectFilter);
  const total = subjects.reduce((count, subject) => count + subject.materials.length, 0);

  return (
    <section aria-labelledby="class-materials">
      <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-3">
        <SectionLabel id="class-materials">
          Materials {!loading && total > 0 && <span className="tabular-nums">({total})</span>}
        </SectionLabel>
        <div className="flex items-center gap-2">
          {subjects.length > 1 && (
            <FilterSelect
              id="material-subject-filter"
              label="Subject"
              value={subjectFilter}
              onChange={setSubjectFilter}
              options={[{ value: '', label: 'All subjects' }, ...subjects.map((subject) => ({ value: subject.id, label: subject.name }))]}
              className="w-44"
            />
          )}
          {canManage && !archived && (
            <Button size="sm" variant="secondary" onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> Add material
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <PageLoader label="Loading materials…" className="py-10" />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : total === 0 && !canManage ? (
        <EmptyState icon={Paperclip} title="No materials yet" message="Your teacher has not shared any materials for this class yet." className="py-10" />
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="No materials yet"
          message="Attach files and images, such as handouts, slides or worksheets, for this class."
          className="py-10"
          action={!archived && (
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> Add material
            </Button>
          )}
        />
      ) : (
        <div className="space-y-3">
          {shownSubjects
            .filter((subject) => canManage || subject.materials.length > 0)
            .map((subject) => (
              <Card key={subject.id}>
                <h3 className="flex items-center justify-between gap-2 border-b border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-900">
                  {subject.name}
                  <span className="text-xs font-normal tabular-nums text-ink-500">
                    {subject.materials.length} {subject.materials.length === 1 ? 'material' : 'materials'}
                  </span>
                </h3>
                {subject.materials.length === 0 ? (
                  <p className="px-5 py-3 text-sm text-ink-500">No materials in this subject yet.</p>
                ) : (
                  <ul className="divide-y divide-ink-200">
                    {subject.materials.map((material) => (
                      <MaterialItem
                        key={material.id}
                        subjectId={subject.id}
                        material={material}
                        now={now}
                        onDelete={canManage ? (item) => setDeleting({ subjectId: subject.id, material: item }) : undefined}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            ))}
        </div>
      )}

      {canManage && (
        <AddMaterialModal
          open={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          classroomId={classroomId}
          subjects={subjects}
          onAdded={load}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this material?"
        message={deleting && (
          <p>
            <span className="font-medium text-ink-900">{deleting.material.title || deleting.material.name}</span> will be
            removed for everyone in this class.
          </p>
        )}
        confirmLabel="Delete"
        confirmVariant="danger"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
