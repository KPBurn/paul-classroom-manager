import DashboardLayout from '../components/navigation/DashboardLayout.jsx';
import { teacherNavigation } from '../config/navigation.js';
import { FeedbackReminderProvider, useFeedbackReminder } from '../context/FeedbackReminderContext.jsx';

function TeacherShell() {
  const { summary } = useFeedbackReminder().pending;
  // A count on the Teacher's Feedback link: amber once anything is more than a week old.
  const badges = summary.students
    ? {
        '/teacher/feedback': {
          count: summary.students,
          tone: summary.overdueStudents ? 'warning' : 'info',
          label: `${summary.students} ${summary.students === 1 ? 'student is' : 'students are'} waiting for feedback`,
        },
      }
    : undefined;
  return <DashboardLayout navigation={teacherNavigation} portalName="Teacher Portal" badges={badges} />;
}

export default function TeacherLayout() {
  return (
    <FeedbackReminderProvider>
      <TeacherShell />
    </FeedbackReminderProvider>
  );
}
