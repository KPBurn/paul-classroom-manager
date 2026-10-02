import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FeedbackView from '../../components/feedback/FeedbackView.jsx';
import { schedulePattern } from '../../components/feedback/feedbackMeta.js';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import PageHeader, { BackLink } from '../../components/common/PageHeader.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
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
    <BackLink to={user.role === 'admin' ? basePath : `${basePath}?tab=history`}>
      {user.role === 'admin' ? 'Teacher Feedback' : 'Feedback history'}
    </BackLink>
  );

  if (error) return <>{back}<Alert tone="error">{error}</Alert></>;
  if (!feedback) return <PageLoader />;

  const isAuthor = user.role === 'teacher' && feedback.teacher.id === user.id;
  return (
    <div>
      {back}
      <PageHeader title="Teacher’s Feedback" />
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
