import { useCallback, useEffect, useState } from 'react';
import { BookOpen, School, SearchX } from 'lucide-react';
import EmptyState from '../../components/common/EmptyState.jsx';
import Alert from '../../components/common/Alert.jsx';
import { FilterSelect, ListToolbar, matchesSearch, SearchInput } from '../../components/common/ListFilters.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import MaterialItem from '../../components/materials/MaterialItem.jsx';
import { useNow } from '../../hooks/useNow.js';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';

export default function StudentMaterials() {
  const now = useNow();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [classroomFilter, setClassroomFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSubjects(await subjectService.list());
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your materials.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const classroomOptions = [
    { value: '', label: 'All classes' },
    ...[...new Map(subjects.map((subject) => [subject.classroom.id, subject.classroom.name])).entries()]
      .map(([value, label]) => ({ value, label })),
  ];
  const shown = subjects
    .filter((subject) => !classroomFilter || subject.classroom.id === classroomFilter)
    .map((subject) => ({
      ...subject,
      materials: subject.materials.filter((material) => matchesSearch(
        query,
        subject.name,
        material.title,
        material.name,
        material.description,
      )),
    }))
    .filter((subject) => subject.materials.length > 0 || (!query && !classroomFilter));
  const count = shown.reduce((total, subject) => total + subject.materials.length, 0);

  return (
    <>
      <PageHeader
        title="Materials"
        description="Files and images your teachers share with your classes. Scheduled materials unlock automatically."
      />
      {subjects.length > 0 && (
        <ListToolbar count={count} noun="material">
          <SearchInput
            id="material-search"
            label="Search materials"
            value={query}
            onChange={setQuery}
            placeholder="Search by title, file or subject"
            className="sm:w-72"
          />
          {classroomOptions.length > 2 && (
            <FilterSelect id="material-class" label="Class" value={classroomFilter} onChange={setClassroomFilter} options={classroomOptions} className="sm:w-48" />
          )}
        </ListToolbar>
      )}
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No materials yet"
          message="Materials will appear here when your teacher shares them with your class."
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={SearchX} title="No materials match your search" message="Try a different word or clear the search." />
      ) : (
        <div className="space-y-3">
          {shown.map((subject) => (
            <section key={subject.id} className="rounded-xl border border-slate-200 bg-white shadow-xs">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <h2 className="font-semibold text-slate-900">{subject.name}</h2>
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <School className="size-3.5" aria-hidden="true" /> {subject.classroom.name}
                </p>
              </header>
              {subject.materials.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">No materials have been shared yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {subject.materials.map((material) => (
                    <MaterialItem key={material.id} subjectId={subject.id} material={material} now={now} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
