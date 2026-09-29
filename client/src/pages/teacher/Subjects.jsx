import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, School } from 'lucide-react';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';

export default function TeacherSubjects() {
  const [classrooms, setClassrooms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [classroomId, setClassroomId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [classroomItems, subjectItems] = await Promise.all([
        classroomService.list(),
        subjectService.list(),
      ]);
      setClassrooms(classroomItems.filter((classroom) => classroom.status === 'active'));
      setSubjects(subjectItems);
      setClassroomId((current) => current || classroomItems.find((classroom) => classroom.status === 'active')?.id || '');
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your subjects and classrooms.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createSubject = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const subject = await subjectService.create({ name, description, classroomId });
      setSubjects((current) => [...current, subject].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setDescription('');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to create this subject.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="My Subjects"
        description="Create a subject for one of your assigned classes, then manage its learning materials."
      />

      {error && <div className="mb-5"><Alert tone="error">{error}</Alert></div>}

      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Plus className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">Create a subject</h2>
            <p className="text-sm text-slate-500">Examples: English 101 or English 102</p>
          </div>
        </div>
        {classrooms.length === 0 && !loading ? (
          <Alert>No active classrooms are assigned to you yet. Ask an administrator to assign a class first.</Alert>
        ) : (
          <form onSubmit={createSubject} className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Subject name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="English 101"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Class / batch
              <select
                required
                value={classroomId}
                onChange={(event) => setClassroomId(event.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 md:col-span-2">
              Description <span className="font-normal text-slate-400">(optional)</span>
              <textarea
                rows={2}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="A short description of this subject"
                className="mt-1.5 block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <div className="md:col-span-2">
              <Button type="submit" isLoading={saving} disabled={loading || classrooms.length === 0}>
                Create subject
              </Button>
            </div>
          </form>
        )}
      </section>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Your subjects</h2>
      {loading ? (
        <div className="flex justify-center py-14"><Spinner /></div>
      ) : subjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <BookOpen className="mx-auto size-8 text-slate-400" aria-hidden="true" />
          <h3 className="mt-3 font-semibold text-slate-900">No subjects yet</h3>
          <p className="mt-1 text-sm text-slate-500">Create a subject above to start sharing materials with a class.</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <Link
                to={`/teacher/subjects/${subject.id}`}
                className="block h-full rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-slate-900">{subject.name}</h3>
                  <BookOpen className="size-5 shrink-0 text-indigo-600" aria-hidden="true" />
                </div>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm text-slate-600">
                  {subject.description || 'Learning materials and resources for this subject.'}
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                  <School className="size-4" aria-hidden="true" />
                  <span>{subject.classroom.name}</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {subject.materials.length} {subject.materials.length === 1 ? 'material' : 'materials'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
