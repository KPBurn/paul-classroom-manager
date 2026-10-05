import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, School, UsersRound } from 'lucide-react';
import { ErrorState } from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import { ButtonLink } from '../../components/common/Button.jsx';
import { cardClass } from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { classroomService } from '../../services/classroom.service.js';
import { useLiveData } from '../../context/LiveSessionsContext.jsx';
import ClassRequests from '../../components/enrollment/ClassRequests.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { formatSchedule } from '../../utils/schedule.js';

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

  // A quiet load keeps what is on screen until the new list arrives, and leaves it there if that fails.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError('');
    }
    try {
      setClassrooms(await classroomService.list());
    } catch (loadError) {
      if (!quiet) setError(getErrorMessage(loadError, 'Unable to load your classrooms.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // An approved class appears here the moment it is approved.
  useLiveData(['classrooms'], () => load({ quiet: true }));

  return (
    <>
      <PageHeader
        title="My Classrooms"
        description={isStudent
          ? 'Classes you are enrolled in. Open a class to see its announcements and upcoming sessions.'
          : 'Classrooms assigned to you, including co-taught classes. Open a class to post announcements.'}
        actions={!isStudent && (
          <ButtonLink to="/teacher/schedule" variant="secondary">
            <CalendarDays className="size-4" aria-hidden="true" />
            View Schedule
          </ButtonLink>
        )}
      />

      {error && <ErrorState message={error} onRetry={load} className="mb-4" />}

      {loading ? (
        <PageLoader label="Loading classrooms…" />
      ) : classrooms.length === 0 && !error ? (
        <EmptyState
          icon={School}
          title={isStudent ? 'Finish your enrollment' : 'No classrooms assigned yet'}
          message={isStudent
            ? 'You are not in a class yet. Use “Request a class” below to choose the classes you want; each one appears here once your school approves it.'
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
                  className={`group flex h-full flex-col p-5 transition hover:border-ink-400 ${cardClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {classroom.subject && <p className="text-xs font-medium uppercase tracking-wider text-ink-500">{classroom.subject}</p>}
                      <h2 className="text-base font-semibold text-ink-900">{classroom.name}</h2>
                    </div>
                    {classroom.openAccess && <Badge tone="warning">Open classroom</Badge>}
                  </div>
                  <div className="mt-4 flex-1 space-y-3 text-sm text-ink-700">
                    {classroom.schedule && (
                      <div className="flex items-start gap-2">
                        <CalendarDays className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
                        <span>{formatSchedule(classroom.schedule)}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <UsersRound className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
                      <span>
                        {size} {size === 1 ? 'student' : 'students'}
                        {!isStudent && classroom.students?.length > 0 && (
                          <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-ink-500">
                            {classroom.students.map(personName).join(', ')}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <School className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
                      <span>
                        {teachers.length > 1 ? 'Co-teachers' : 'Teacher'}
                        <span className="mt-1 block text-xs text-ink-500">{teachers.map(personName).join(', ')}</span>
                      </span>
                    </div>
                  </div>
                  <span className="mt-5 flex items-center justify-between gap-1 border-t border-ink-200 pt-3 text-sm font-medium text-ink-600 group-hover:text-ink-900">
                    {isStudent ? 'Open class' : 'Open class and announcements'}
                    <ChevronRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {isStudent && !loading && !error && <ClassRequests enrolledIds={classrooms.map((classroom) => classroom.id)} />}
    </>
  );
}
