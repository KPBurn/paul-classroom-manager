import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  CircleUser,
  ClipboardCheck,
  GraduationCap,
  History,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  School,
  Settings,
  Target,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';

/**
 * Sidebar structure for each portal. `phase` marks modules that are not built
 * yet; their routes render a placeholder until that phase is delivered.
 */
export const adminNavigation = [
  {
    items: [{ label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true }],
  },
  {
    heading: 'User Management',
    items: [
      { label: 'All Users', to: '/admin/users', icon: Users },
      { label: 'Teachers', to: '/admin/teachers', icon: UserRound },
      { label: 'Students', to: '/admin/students', icon: GraduationCap },
    ],
  },
  {
    heading: 'Academic Management',
    items: [
      { label: 'Classrooms', to: '/admin/classrooms', icon: School },
      { label: 'Competencies', to: '/admin/competencies', icon: Target, phase: 3 },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Announcements', to: '/admin/announcements', icon: Megaphone },
      { label: 'Schedules', to: '/admin/schedules', icon: CalendarDays },
      { label: 'Teacher Feedback', to: '/admin/feedback', icon: MessageSquareText },
      { label: 'Salaries', to: '/admin/salaries', icon: Wallet, phase: 5 },
      { label: 'Activity Logs', to: '/admin/activity-logs', icon: History, phase: 3 },
      { label: 'Settings', to: '/admin/settings', icon: Settings },
    ],
  },
];

export const teacherNavigation = [
  {
    items: [
      { label: 'Dashboard', to: '/teacher', icon: LayoutDashboard, end: true },
      { label: 'Announcements', to: '/teacher/announcements', icon: Megaphone },
      { label: 'My Classrooms', to: '/teacher/classrooms', icon: School },
      { label: 'Students', to: '/teacher/students', icon: GraduationCap, phase: 4 },
      { label: 'Assessments', to: '/teacher/assessments', icon: ClipboardCheck, phase: 4 },
      { label: 'Scores', to: '/teacher/scores', icon: ChartColumn, phase: 4 },
      { label: 'Schedule', to: '/teacher/schedule', icon: CalendarDays },
      { label: "Teacher's Feedback", to: '/teacher/feedback', icon: MessageSquareText },
      { label: 'Salary', to: '/teacher/salary', icon: Wallet, phase: 5 },
      { label: 'Profile', to: '/teacher/profile', icon: CircleUser },
    ],
  },
];

export const studentNavigation = [
  {
    items: [
      { label: 'Dashboard', to: '/student', icon: LayoutDashboard, end: true },
      { label: 'My Classrooms', to: '/student/classrooms', icon: School },
      { label: 'Materials', to: '/student/materials', icon: BookOpen },
    ],
  },
];

/** Flattens the sidebar sections into a list of navigable modules. */
export const navigationItems = (sections) => sections.flatMap((section) => section.items);
