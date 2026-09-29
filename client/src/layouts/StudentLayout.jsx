import DashboardLayout from '../components/navigation/DashboardLayout.jsx';
import { studentNavigation } from '../config/navigation.js';

export default function StudentLayout() {
  return <DashboardLayout navigation={studentNavigation} portalName="Student Portal" />;
}
