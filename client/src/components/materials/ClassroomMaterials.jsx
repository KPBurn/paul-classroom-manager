import { Paperclip, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '../common/Button.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import { FilterSelect } from '../common/ListFilters.jsx';
import Spinner from '../common/Spinner.jsx';
import { useNow } from '../../hooks/useNow.js';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import AddMaterialModal from './AddMaterialModal.jsx';
import MaterialItem from './MaterialItem.jsx';

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="class-materials" className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Materials {!loading && total > 0 && <span className="font-normal normal-case tracking-normal">({total})</span>}
        </h2>
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
            <Button className="!px-3 !py-2" onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> Add material
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-10 text-indigo-600"><Spinner className="size-5" /></div>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : total === 0 && !canManage ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <Paperclip className="mx-auto size-6 text-slate-400" aria-hidden="true" />
          <p className="mt-2 text-sm text-slate-600">Your teacher has not shared any materials for this class yet.</p>
        </div>
      ) : subjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <Paperclip className="mx-auto size-6 text-slate-400" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900">No materials yet</p>
          <p className="mt-1 text-sm text-slate-500">Attach files and images, such as handouts, slides or worksheets, for this class.</p>
          {!archived && (
            <Button className="mt-4" onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> Add material
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {shownSubjects
            .filter((subject) => canManage || subject.materials.length > 0)
            .map((subject) => (
              <div key={subject.id} className="rounded-xl border border-slate-200 bg-white shadow-xs">
                <h3 className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-900">
                  {subject.name}
                  <span className="text-xs font-normal text-slate-500">
                    {subject.materials.length} {subject.materials.length === 1 ? 'material' : 'materials'}
                  </span>
                </h3>
                {subject.materials.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">No materials in this subject yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
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
              </div>
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
            <span className="font-medium text-slate-900">{deleting.material.title || deleting.material.name}</span> will be
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
