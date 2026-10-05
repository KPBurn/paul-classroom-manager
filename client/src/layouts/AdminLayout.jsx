import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '../components/navigation/DashboardLayout.jsx';
import { adminNavigation } from '../config/navigation.js';
import { useLiveData } from '../context/LiveSessionsContext.jsx';
import { enrollmentService } from '../services/enrollment.service.js';

/** A count on the Enrollment link of the applications waiting for a decision, kept current as they arrive. */
function useEnrollmentBadges() {
  const [pending, setPending] = useState(0);

  const check = useCallback(() => {
    // The badge is a convenience: if it cannot load, the page itself still shows what is waiting.
    enrollmentService.list({ limit: 1, status: 'pending' })
      .then(({ pendingCount }) => setPending(pendingCount))
      .catch(() => {});
  }, []);

  useEffect(() => {
    check();
  }, [check]);
  useLiveData(['enrollment'], check);

  return pending
    ? {
        '/admin/enrollment': {
          count: pending,
          tone: 'warning',
          label: `${pending} ${pending === 1 ? 'application is' : 'applications are'} waiting for a decision`,
        },
      }
    : undefined;
}

export default function AdminLayout() {
  return <DashboardLayout navigation={adminNavigation} portalName="Admin Portal" useBadges={useEnrollmentBadges} />;
}
