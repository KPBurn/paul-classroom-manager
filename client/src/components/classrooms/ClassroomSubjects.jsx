import { BookOpen, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import Spinner from '../common/Spinner.jsx';
import TextField, { TextAreaField } from '../common/TextField.jsx';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';

/**
 * The classroom's subjects. Teachers add subjects here and open each one to
 * upload materials; students go to their Materials page to download them.
 */
export default function ClassroomSubjects({ classroomId, canManage, archived }) {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const all = await subjectService.list();
      setSubjects(all.filter((subject) => subject.classroom?.id === classroomId));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load subjects.'));
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = () => {
    setName('');
    setDescription('');
    setIsFormOpen(true);
  };

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const subject = await subjectService.create({ name, description, classroomId });
      setSubjects((current) => [...current, subject].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`${subject.name} was added. Open it to upload materials.`);
      setIsFormOpen(false);
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, 'Unable to add this subject.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="class-subjects">
      <div className="flex items-center justify-between gap-3">
        <h2 id="class-subjects" className="flex items-center gap-2 font-semibold text-slate-900">
          <BookOpen className="size-4 text-indigo-600" aria-hidden="true" /> Subjects & materials
        </h2>
        {canManage && !archived && (
          <button
            type="button"
            onClick={openForm}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            <Plus className="size-4" aria-hidden="true" /> Add
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6 text-indigo-600"><Spinner className="size-5" /></div>
      ) : error ? (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      ) : subjects.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          {canManage
            ? 'Add a subject, such as English 101, to share files with this class.'
            : 'Your teacher has not shared any materials for this class yet.'}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <Link
                to={canManage ? `/teacher/subjects/${subject.id}` : '/student/materials'}
                className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{subject.name}</span>
                  <span className="text-xs text-slate-500">
                    {subject.materials.length} {subject.materials.length === 1 ? 'material' : 'materials'}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={isFormOpen}
        onClose={() => !saving && setIsFormOpen(false)}
        title="Add a subject"
        description="Students in this class will see the materials you upload to it."
      >
        <form onSubmit={create} className="space-y-5">
          <TextField
            id="subject-name"
            label="Subject name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. English 101"
          />
          <TextAreaField
            id="subject-description"
            label="Description (optional)"
            rows={3}
            maxLength={500}
            count={description.length}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="A short description of this subject"
          />
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setIsFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" isLoading={saving} disabled={!name.trim()}>Add subject</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
