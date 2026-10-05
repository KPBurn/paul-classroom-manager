import { useCallback, useEffect, useState } from 'react';
import FeedbackHistory from '../../components/feedback/FeedbackHistory.jsx';
import Alert from '../../components/common/Alert.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import { useLiveData } from '../../context/LiveSessionsContext.jsx';
import { classroomService } from '../../services/classroom.service.js';
import { userService } from '../../services/user.service.js';
import { getErrorMessage } from '../../utils/errors.js';

/** Read-only view of every teacher's student feedback. */
export default function AdminFeedback() {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(({ quiet = false } = {}) => {
    Promise.all([classroomService.list({ includeArchived: true }), userService.listAll({ role: 'teacher' })])
      .then(([classrooms, teachers]) => setOptions({ classrooms, teachers }))
      .catch((loadError) => {
        if (!quiet) setError(getErrorMessage(loadError, 'Unable to load classes and teachers.'));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // The filter choices follow classes and teachers as they are added.
  useLiveData(['classrooms', 'users'], () => load({ quiet: true }));

  return (
    <>
      <PageHeader
        title="Teacher Feedback"
        description="Feedback teachers have written for students after each lesson. Only the teacher who wrote it can change it."
      />
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : !options ? (
        <PageLoader />
      ) : (
        <FeedbackHistory classrooms={options.classrooms} teachers={options.teachers} basePath="/admin/feedback" />
      )}
    </>
  );
}
