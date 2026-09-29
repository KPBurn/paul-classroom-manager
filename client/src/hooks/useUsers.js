import { useCallback, useEffect, useState } from 'react';
import { userService } from '../services/user.service.js';
import { getErrorMessage } from '../utils/errors.js';

const NO_FILTERS = { search: '', role: '', status: '' };

/** Loads one page of users matching the filters, sorted by name. */
export function useUsers(pageSize, initialFilters = {}) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ ...NO_FILTERS, ...initialFilters });
  const [reloadKey, setReloadKey] = useState(0);
  const [list, setList] = useState({ status: 'loading', items: [], pagination: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    setList((current) => ({ ...current, status: 'loading' }));

    userService
      .list({ page, limit: pageSize, ...filters })
      .then(({ items, pagination }) => {
        if (!cancelled) setList({ status: 'ready', items, pagination, error: '' });
      })
      .catch((error) => {
        if (!cancelled) {
          setList({
            status: 'error',
            items: [],
            pagination: null,
            error: getErrorMessage(error, 'Unable to load users.'),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, filters, reloadKey]);

  // A new filter starts again from the first page.
  const updateFilters = useCallback((changes) => {
    setFilters((current) => ({ ...current, ...changes }));
    setPage(1);
  }, []);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { ...list, page, setPage, filters, updateFilters, reload };
}
