import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, School, UsersRound } from 'lucide-react';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { getErrorMessage } from '../../utils/errors.js';

export default function TeacherClassrooms() {
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
        description="Classrooms assigned to you, including your co-taught classes."
        actions={
          <Link
            to="/teacher/schedule"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            View Schedule
          </Link>
        }
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <School className="mx-auto size-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-slate-900">No classrooms assigned yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ask your administrator to assign your teacher account to a classroom.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classrooms.map((classroom) => {
            const teachers = classroom.teachers?.length
              ? classroom.teachers
              : classroom.teacher ? [classroom.teacher] : [];

            return (
              <li key={classroom.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-slate-900">{classroom.name}</h2>
                  {classroom.openAccess && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Open classroom
                    </span>
                  )}
                </div>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-2">
                    <UsersRound className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span>
                      {classroom.students?.length ?? 0} students
                      {classroom.students?.length > 0 && (
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                          {classroom.students.map((student) => student.name
                            ?? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()).join(', ')}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <School className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span>
                      {teachers.length > 1 ? 'Co-teachers' : 'Teacher'}
                      <span className="mt-1 block text-xs text-slate-500">
                        {teachers.map((teacher) => teacher.name
                          ?? `${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim()).join(', ')}
                      </span>
                    </span>
                  </div>
                </div>
                <Link
                  to="/teacher/schedule"
                  className="mt-5 inline-flex text-sm font-medium text-indigo-700 hover:text-indigo-800"
                >
                  View classroom schedule
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
