import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { feedbackService } from '../services/feedback.service.js';

const EMPTY = { items: [], summary: { lessons: 0, students: 0, overdueLessons: 0, overdueStudents: 0 } };
const FeedbackReminderContext = createContext({ pending: EMPTY, refresh: () => {} });

/**
 * Shares the teacher's unfinished feedback (lessons from the last two weeks)
 * with the sidebar badge, the dashboard and the feedback pages.
 */
export function FeedbackReminderProvider({ children }) {
  const [pending, setPending] = useState(EMPTY);

  const refresh = useCallback(() => {
    // Reminders are a convenience: if they cannot load, pages simply show none.
    feedbackService.pending().then(setPending).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ pending, refresh }), [pending, refresh]);
  return <FeedbackReminderContext.Provider value={value}>{children}</FeedbackReminderContext.Provider>;
}

export const useFeedbackReminder = () => useContext(FeedbackReminderContext);
