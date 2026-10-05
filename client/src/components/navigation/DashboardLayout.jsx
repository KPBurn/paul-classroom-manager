import { Fragment, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LiveSessionsProvider } from '../../context/LiveSessionsContext.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

const noBadges = () => undefined;

function Shell({ navigation, portalName, useBadges }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const badges = useBadges();

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen">
      <Sidebar
        navigation={navigation}
        portalName={portalName}
        badges={badges}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="lg:pl-64">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * The frame of a portal. Everything inside it, the sidebar included, shares
 * one live connection, so pages and badges change as things happen.
 *
 * `useBadges` is a hook that returns the sidebar badges (see Sidebar);
 * `providers` wraps the portal in anything else its pages share.
 */
export default function DashboardLayout({ navigation, portalName, useBadges = noBadges, providers: Providers = Fragment }) {
  return (
    <LiveSessionsProvider>
      <Providers>
        <Shell navigation={navigation} portalName={portalName} useBadges={useBadges} />
      </Providers>
    </LiveSessionsProvider>
  );
}
