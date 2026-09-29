import { ArrowLeft, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import FeedbackView from '../../components/feedback/FeedbackView.jsx';
import { schedulePattern } from '../../components/feedback/feedbackMeta.js';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { feedbackService } from '../../services/feedback.service.js';
import { getErrorMessage } from '../../utils/errors.js';

/** One feedback record, read-only, for teachers (from History) and admins. */
export default function FeedbackDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const basePath = user.role === 'admin' ? '/admin/feedback' : '/teacher/feedback';

  useEffect(() => {
    let cancelled = false;
    setFeedback(null);
    setError('');
    feedbackService.get(id)
      .then((result) => {
        if (!cancelled) setFeedback(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError, 'Unable to load this feedback.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const back = (
    <Link
      to={user.role === 'admin' ? basePath : `${basePath}?tab=history`}
      className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> {user.role === 'admin' ? 'Teacher Feedback' : 'Feedback history'}
    </Link>
  );

  if (error) return <>{back}<Alert tone="error">{error}</Alert></>;
  if (!feedback) return <div className="flex justify-center py-16"><Spinner /></div>;

  const isAuthor = user.role === 'teacher' && feedback.teacher.id === user.id;
  return (
    <div className="mx-auto max-w-5xl">
      {back}
      <h1 className="mb-4 text-2xl font-semibold tracking-tight text-slate-900">Teacher&apos;s Feedback</h1>
      <FeedbackView
        feedback={feedback}
        schedule={feedback.session.seriesId ? undefined : schedulePattern(feedback.session)}
        actions={isAuthor && (
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => navigate(`/teacher/feedback/lesson/${feedback.session.id}/student/${feedback.student.id}?edit=1`)}
          >
            <Pencil className="size-4" aria-hidden="true" /> Edit feedback
          </Button>
        )}
      />
    </div>
  );
}
