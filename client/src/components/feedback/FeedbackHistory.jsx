import { ChevronRight, MessageSquareText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../common/Alert.jsx';
import Button from '../common/Button.jsx';
import { FilterSelect, ListToolbar } from '../common/ListFilters.jsx';
import Pagination from '../common/Pagination.jsx';
import Spinner from '../common/Spinner.jsx';
import { feedbackService } from '../../services/feedback.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { FEEDBACK_STATUS, formatShortDate, formatTime } from './feedbackMeta.js';

const PAGE_SIZE = 20;
const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'completed', label: 'Completed' },
  { value: 'draft', label: 'Drafts' },
];
const dateInputClass = 'h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

/**
 * Past feedback with filters. `classrooms` feed the class and student
 * filters; `teachers` (admins only) adds a teacher filter and column.
 */
export default function FeedbackHistory({ classrooms, teachers, basePath }) {
  const [filters, setFilters] = useState({ classroomId: '', studentId: '', teacherId: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ status: 'loading', items: [], pagination: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: 'loading' }));
    feedbackService.list({
      page,
      limit: PAGE_SIZE,
      classroomId: filters.classroomId,
      studentId: filters.studentId,
      teacherId: filters.teacherId,
      status: filters.status,
      from: filters.from ? new Date(`${filters.from}T00:00`).toISOString() : '',
      to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : '',
    })
      .then(({ items, pagination }) => {
        if (!cancelled) setState({ status: 'ready', items, pagination, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', items: [], pagination: null, error: getErrorMessage(error, 'Unable to load feedback.') });
      });
    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  const update = (changes) => {
    setFilters((current) => ({ ...current, ...changes }));
    setPage(1);
  };
  const studentsForFilter = [...new Map(
    classrooms
      .filter((classroom) => !filters.classroomId || classroom.id === filters.classroomId)
      .flatMap((classroom) => classroom.students ?? [])
      .map((student) => [student.id, `${student.firstName} ${student.lastName}`]),
  ).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div>
      <ListToolbar count={state.pagination?.total} noun="feedback record">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <FilterSelect
            id="feedback-class"
            label="Class"
            value={filters.classroomId}
            onChange={(classroomId) => update({ classroomId, studentId: '' })}
            options={[{ value: '', label: 'All classes' }, ...classrooms.map((classroom) => ({ value: classroom.id, label: classroom.name }))]}
            className="sm:w-44"
          />
          <FilterSelect
            id="feedback-student"
            label="Student"
            value={filters.studentId}
            onChange={(studentId) => update({ studentId })}
            options={[{ value: '', label: 'All students' }, ...studentsForFilter.map(([value, label]) => ({ value, label }))]}
            className="sm:w-44"
          />
          {teachers && (
            <FilterSelect
              id="feedback-teacher"
              label="Teacher"
              value={filters.teacherId}
              onChange={(teacherId) => update({ teacherId })}
              options={[{ value: '', label: 'All teachers' }, ...teachers.map((teacher) => ({ value: teacher.id, label: `${teacher.firstName} ${teacher.lastName}` }))]}
              className="sm:w-44"
            />
          )}
          <FilterSelect id="feedback-status" label="Status" value={filters.status} onChange={(status) => update({ status })} options={STATUS_OPTIONS} className="sm:w-36" />
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="sr-only sm:not-sr-only">From</span>
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => update({ from: event.target.value })} className={`${dateInputClass} w-full sm:w-36`} aria-label="From date" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="sr-only sm:not-sr-only">To</span>
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update({ to: event.target.value })} className={`${dateInputClass} w-full sm:w-36`} aria-label="To date" />
          </label>
        </div>
      </ListToolbar>

      {state.status === 'error' ? (
        <Alert tone="error">{state.error}</Alert>
      ) : state.status === 'loading' && state.items.length === 0 ? (
        <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-14 text-indigo-600"><Spinner className="size-6" /></div>
      ) : state.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <MessageSquareText className="mx-auto size-7 text-slate-400" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900">{hasFilters ? 'No feedback matches your filters' : 'No feedback yet'}</p>
          <p className="mt-1 text-sm text-slate-500">
            {hasFilters ? 'Try another class, student, status or date.' : 'Feedback appears here after it is saved.'}
          </p>
          {hasFilters && (
            <Button variant="secondary" className="mt-4" onClick={() => update({ classroomId: '', studentId: '', teacherId: '', status: '', from: '', to: '' })}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className={`divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-xs transition-opacity ${state.status === 'loading' ? 'opacity-60' : ''}`}>
            {state.items.map((item) => {
              const status = FEEDBACK_STATUS[item.status];
              return (
                <li key={item.id}>
                  <Link
                    to={`${basePath}/${item.id}`}
                    className="group flex items-center gap-3 border-l-4 border-transparent px-4 py-3 transition hover:border-indigo-500 hover:bg-indigo-50/60"
                  >
                    <div className="w-24 shrink-0 text-sm">
                      <p className="font-medium text-slate-900">{formatShortDate(item.session.startsAt)}</p>
                      <p className="text-xs text-slate-500">{formatTime(item.session.startsAt)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-800">{item.student.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {item.classroom.name}
                        {item.book && ` · ${item.book}`}
                        {teachers && ` · by ${item.teacher.name}`}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.style}`}>{status.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination
            className="mt-4"
            pagination={state.pagination}
            itemCount={state.items.length}
            disabled={state.status === 'loading'}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
