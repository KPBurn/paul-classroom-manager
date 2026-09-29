import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { adminNavigation, navigationItems, studentNavigation, teacherNavigation } from '../config/navigation.js';
import { useAuth } from '../hooks/useAuth.js';
import FullPageSpinner from '../components/common/FullPageSpinner.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';
import TeacherLayout from '../layouts/TeacherLayout.jsx';
import Announcements from '../pages/admin/Announcements.jsx';
import AdminDashboard from '../pages/admin/Dashboard.jsx';
import Users from '../pages/admin/Users.jsx';
import Login from '../pages/auth/Login.jsx';
import ComingSoon from '../pages/shared/ComingSoon.jsx';
import NotFound from '../pages/shared/NotFound.jsx';
import Profile from '../pages/shared/Profile.jsx';
import TeacherAnnouncements from '../pages/teacher/Announcements.jsx';
import TeacherDashboard from '../pages/teacher/Dashboard.jsx';
import { homePathFor, ROLES } from '../utils/roles.js';
import { GuestRoute, ProtectedRoute } from './ProtectedRoute.jsx';

const Classrooms = lazy(() => import('../pages/admin/Classrooms.jsx'));
const TeacherSchedule = lazy(() => import('../pages/teacher/Schedule.jsx'));
const StudentDashboard = lazy(() => import('../pages/student/Dashboard.jsx'));
const StudentLayout = lazy(() => import('../layouts/StudentLayout.jsx'));
const SessionRoom = lazy(() => import('../pages/shared/SessionRoom.jsx'));
const suspense = (element) => <Suspense fallback={<FullPageSpinner />}>{element}</Suspense>;

/** Placeholder routes for sidebar modules that have not been built yet. */
const plannedRoutes = (sections) =>
  navigationItems(sections)
    .filter((item) => item.phase)
    .map(({ to, label, phase }) => (
      <Route key={to} path={to} element={<ComingSoon title={label} phase={phase} />} />
    ));

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user.role)} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomeRedirect />
          </ProtectedRoute>
        }
      />

      <Route
        path="/sessions/:id/room"
        element={
          <ProtectedRoute roles={[ROLES.ADMIN, ROLES.TEACHER, ROLES.STUDENT]}>
            {suspense(<SessionRoom />)}
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={[ROLES.ADMIN]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="classrooms" element={suspense(<Classrooms />)} />
        {/* Keys stop React reusing one page's filters and search on another. */}
        <Route path="users" element={<Users key="all" />} />
        <Route path="teachers" element={<Users key="teacher" role={ROLES.TEACHER} />} />
        <Route path="students" element={<Users key="student" role={ROLES.STUDENT} />} />
        {plannedRoutes(adminNavigation)}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      <Route
        path="/teacher"
        element={
          <ProtectedRoute roles={[ROLES.TEACHER]}>
            <TeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="announcements" element={<TeacherAnnouncements />} />
        <Route path="schedule" element={suspense(<TeacherSchedule />)} />
        <Route path="profile" element={<Profile />} />
        {plannedRoutes(teacherNavigation)}
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Route>

      <Route
        path="/student"
        element={
          <ProtectedRoute roles={[ROLES.STUDENT]}>
            {suspense(<StudentLayout />)}
          </ProtectedRoute>
        }
      >
        <Route index element={suspense(<StudentDashboard />)} />
        {plannedRoutes(studentNavigation)}
        <Route path="*" element={<Navigate to="/student" replace />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
