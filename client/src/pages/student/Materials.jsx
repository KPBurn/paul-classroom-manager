import { useCallback, useEffect, useState } from 'react';
import { BookOpen, School, SearchX } from 'lucide-react';
import EmptyState from '../../components/common/EmptyState.jsx';
import Alert from '../../components/common/Alert.jsx';
import { FilterSelect, ListToolbar, matchesSearch, SearchInput } from '../../components/common/ListFilters.jsx';
import Card from '../../components/common/Card.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import MaterialItem from '../../components/materials/MaterialItem.jsx';
import { useNow } from '../../hooks/useNow.js';
import { subjectService } from '../../services/subject.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useLiveData } from '../../context/LiveSessionsContext.jsx';

export default function StudentMaterials() {
  const now = useNow();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [classroomFilter, setClassroomFilter] = useState('');

  // A quiet load keeps what is on screen until the new list arrives, and leaves it there if that fails.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError('');
    }
    try {
      setSubjects(await subjectService.list());
    } catch (loadError) {
      if (!quiet) setError(getErrorMessage(loadError, 'Unable to load your materials.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useLiveData(['materials', 'classrooms'], () => load({ quiet: true }));

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
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      {loading ? (
        <PageLoader label="Loading materials…" />
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
            <Card as="section" key={subject.id}>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-5 py-2.5">
                <h2 className="text-sm font-semibold text-ink-900">{subject.name}</h2>
                <p className="flex items-center gap-1.5 text-xs text-ink-500">
                  <School className="size-3.5" aria-hidden="true" /> {subject.classroom.name}
                </p>
              </header>
              {subject.materials.length === 0 ? (
                <p className="px-5 py-3 text-sm text-ink-500">No materials have been shared yet.</p>
              ) : (
                <ul className="divide-y divide-ink-200">
                  {subject.materials.map((material) => (
                    <MaterialItem key={material.id} subjectId={subject.id} material={material} now={now} />
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
