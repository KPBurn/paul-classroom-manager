import DashboardLayout from '../components/navigation/DashboardLayout.jsx';
import { teacherNavigation } from '../config/navigation.js';
import { FeedbackReminderProvider, useFeedbackReminder } from '../context/FeedbackReminderContext.jsx';

/** A count on the Teacher's Feedback link: amber once anything is more than a week old. */
function useFeedbackBadges() {
  const { summary } = useFeedbackReminder().pending;
  return summary.students
    ? {
        '/teacher/feedback': {
          count: summary.students,
          tone: summary.overdueStudents ? 'warning' : 'info',
          label: `${summary.students} ${summary.students === 1 ? 'student is' : 'students are'} waiting for feedback`,
        },
      }
    : undefined;
}

export default function TeacherLayout() {
  return (
    <DashboardLayout
      navigation={teacherNavigation}
      portalName="Teacher Portal"
      useBadges={useFeedbackBadges}
      providers={FeedbackReminderProvider}
    />
  );
}
