import DashboardLayout from '../components/navigation/DashboardLayout.jsx';
import { teacherNavigation } from '../config/navigation.js';

export default function TeacherLayout() {
  return <DashboardLayout navigation={teacherNavigation} portalName="Teacher Portal" />;
}
