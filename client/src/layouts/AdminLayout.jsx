import DashboardLayout from '../components/navigation/DashboardLayout.jsx';
import { adminNavigation } from '../config/navigation.js';

export default function AdminLayout() {
  return <DashboardLayout navigation={adminNavigation} portalName="Admin Portal" />;
}
