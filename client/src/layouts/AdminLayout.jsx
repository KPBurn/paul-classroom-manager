import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ENROLLMENT_CHANGED_EVENT } from '../components/enrollment/enrollmentMeta.js';
import DashboardLayout from '../components/navigation/DashboardLayout.jsx';
import { adminNavigation } from '../config/navigation.js';
import { enrollmentService } from '../services/enrollment.service.js';

/** How many enrollment applications are waiting, checked on each page change and after a decision. */
function usePendingEnrollments() {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const check = () => enrollmentService.list({ limit: 1, status: 'pending' })
      .then(({ pendingCount }) => {
        if (!cancelled) setCount(pendingCount);
      })
      .catch(() => {});
    check();
    window.addEventListener(ENROLLMENT_CHANGED_EVENT, check);
    return () => {
      cancelled = true;
      window.removeEventListener(ENROLLMENT_CHANGED_EVENT, check);
    };
  }, [pathname]);

  return count;
}

export default function AdminLayout() {
  const pending = usePendingEnrollments();
  const badges = pending
    ? {
        '/admin/enrollment': {
          count: pending,
          tone: 'warning',
          label: `${pending} ${pending === 1 ? 'application is' : 'applications are'} waiting for a decision`,
        },
      }
    : undefined;
  return <DashboardLayout navigation={adminNavigation} portalName="Admin Portal" badges={badges} />;
}
