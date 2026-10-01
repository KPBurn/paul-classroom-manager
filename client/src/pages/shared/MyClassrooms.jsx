import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, School, UsersRound } from 'lucide-react';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { classroomService } from '../../services/classroom.service.js';
import { getErrorMessage } from '../../utils/errors.js';

export const personName = (person) => person.name ?? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
export const classroomTeachers = (classroom) => (classroom.teachers?.length
  ? classroom.teachers
  : classroom.teacher ? [classroom.teacher] : []);
export const classroomSize = (classroom) => classroom.studentCount ?? classroom.students?.length ?? 0;

/** Classrooms for the signed-in teacher or student; each card opens the classroom page. */
export default function MyClassrooms() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setClassrooms(await classroomService.list());
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load your classrooms.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="My Classrooms"
        description={isStudent
          ? 'Classes you are enrolled in. Open a class to see its announcements and upcoming sessions.'
          : 'Classrooms assigned to you, including co-taught classes. Open a class to post announcements.'}
        actions={!isStudent && (
          <Link
            to="/teacher/schedule"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            View Schedule
          </Link>
        )}
      />

      {error && (
        <div className="mb-4 space-y-3">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" onClick={load}>Try again</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : classrooms.length === 0 && !error ? (
        <EmptyState
          icon={School}
          title={isStudent ? 'You are not enrolled in a class yet' : 'No classrooms assigned yet'}
          message={isStudent
            ? 'Your classes will appear here once your school enrolls you.'
            : 'Ask your administrator to assign your teacher account to a classroom.'}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classrooms.map((classroom) => {
            const teachers = classroomTeachers(classroom);
            const size = classroomSize(classroom);

            return (
              <li key={classroom.id}>
                <Link
                  to={`/${user.role}/classrooms/${classroom.id}`}
                  className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-slate-900 group-hover:text-indigo-700">{classroom.name}</h2>
                    {classroom.openAccess && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        Open classroom
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex-1 space-y-3 text-sm text-slate-600">
                    <div className="flex items-start gap-2">
                      <UsersRound className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <span>
                        {size} {size === 1 ? 'student' : 'students'}
                        {!isStudent && classroom.students?.length > 0 && (
                          <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-slate-500">
                            {classroom.students.map(personName).join(', ')}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <School className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <span>
                        {teachers.length > 1 ? 'Co-teachers' : 'Teacher'}
                        <span className="mt-1 block text-xs text-slate-500">{teachers.map(personName).join(', ')}</span>
                      </span>
                    </div>
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-indigo-700">
                    {isStudent ? 'Open class' : 'Open class and announcements'}
                    <ChevronRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
