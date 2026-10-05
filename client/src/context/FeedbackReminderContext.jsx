import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveData } from './LiveSessionsContext.jsx';
import { feedbackService } from '../services/feedback.service.js';

const EMPTY = { items: [], summary: { lessons: 0, students: 0, overdueLessons: 0, overdueStudents: 0 } };
// How long loaded reminders count as current for a page that only wants to show them.
const FRESH_MS = 60_000;
const FeedbackReminderContext = createContext({ pending: EMPTY, refresh: () => {}, refreshIfStale: () => {} });

/**
 * Shares the teacher's unfinished feedback (lessons from the last two weeks)
 * with the sidebar badge, the dashboard and the feedback pages. The provider
 * is the only place that loads it.
 */
export function FeedbackReminderProvider({ children }) {
  const [pending, setPending] = useState(EMPTY);
  // When the newest request was sent, and its number, so an older answer never replaces a newer one.
  const latest = useRef({ request: 0, sentAt: 0 });

  /** Loads the reminders again. Call it after saving feedback. */
  const refresh = useCallback(() => {
    const request = latest.current.request + 1;
    latest.current = { request, sentAt: Date.now() };
    // Reminders are a convenience: if they cannot load, pages simply show none.
    feedbackService.pending()
      .then((loaded) => {
        if (latest.current.request === request) setPending(loaded);
      })
      .catch(() => {});
  }, []);

  /** For a page that shows the reminders when it opens: loads them unless that was done a moment ago. */
  const refreshIfStale = useCallback(() => {
    if (Date.now() - latest.current.sentAt > FRESH_MS) refresh();
  }, [refresh]);

  useEffect(() => {
    refreshIfStale();
  }, [refreshIfStale]);
  // Feedback written on another device, or a lesson that just ended, changes what is waiting.
  useLiveData(['feedback'], refresh);

  const value = useMemo(() => ({ pending, refresh, refreshIfStale }), [pending, refresh, refreshIfStale]);
  return <FeedbackReminderContext.Provider value={value}>{children}</FeedbackReminderContext.Provider>;
}

export const useFeedbackReminder = () => useContext(FeedbackReminderContext);
