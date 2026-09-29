import { useCallback, useEffect, useState } from 'react';
import { announcementService } from '../services/announcement.service.js';
import { getErrorMessage } from '../utils/errors.js';

/** Loads one page of announcements, newest first. */
export function useAnnouncements(pageSize) {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [list, setList] = useState({ status: 'loading', items: [], pagination: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    setList((current) => ({ ...current, status: 'loading' }));

    announcementService
      .list({ page, limit: pageSize })
      .then(({ items, pagination }) => {
        if (!cancelled) setList({ status: 'ready', items, pagination, error: '' });
      })
      .catch((error) => {
        if (!cancelled) {
          setList({
            status: 'error',
            items: [],
            pagination: null,
            error: getErrorMessage(error, 'Unable to load announcements.'),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { ...list, page, setPage, reload };
}
