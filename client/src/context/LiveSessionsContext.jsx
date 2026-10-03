import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth.js';
import { refreshNow } from '../hooks/useNow.js';
import { connectToSessionRoom, SESSION_EVENTS } from '../services/sessionRoom.service.js';
import { applySessionEvent } from '../utils/liveSessions.js';

const WATCH_RETRY_MS = 3_000;
const LiveSessionsContext = createContext({ status: 'offline', presence: {}, subscribe: () => () => {} });

/**
 * Keeps one connection open while someone is signed in, and shares what it
 * hears about their classes with every page: a class starting or ending, and
 * who is in each room. Pages change as it happens, with no refresh.
 *
 * `status` is 'connecting', 'live', 'reconnecting' or 'offline'. `presence`
 * holds who is in each room, by session id. After a reconnection, listeners
 * get a 'resync' so they can catch up on what they missed.
 */
export function LiveSessionsProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('connecting');
  const [presence, setPresence] = useState({});
  const listeners = useRef(new Set());

  const subscribe = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  useEffect(() => {
    const socket = connectToSessionRoom();
    let closed = false;
    let watchedBefore = false;
    let retryTimer;
    const notify = (type, payload) => {
      for (const listener of listeners.current) listener(type, payload);
    };

    const watch = () => {
      socket.timeout(10_000).emit('sessions:watch', (timeoutError, reply) => {
        if (closed || !socket.connected) return;
        if (timeoutError || !reply?.presence) {
          retryTimer = window.setTimeout(watch, WATCH_RETRY_MS);
          return;
        }
        setPresence(Object.fromEntries(reply.presence.map((item) => [item.sessionId, item])));
        setStatus('live');
        // Anything that happened while the connection was down was missed.
        if (watchedBefore) notify('resync');
        watchedBefore = true;
      });
    };

    socket.on('connect', watch);
    socket.on('disconnect', (reason) => {
      window.clearTimeout(retryTimer);
      setStatus('reconnecting');
      // The server closed it (for example the token ran out): try once with the token stored now.
      if (reason === 'io server disconnect') socket.connect();
    });
    socket.on('connect_error', () => setStatus(socket.active ? 'reconnecting' : 'offline'));
    socket.on(SESSION_EVENTS.presence, (payload) => {
      setPresence((current) => {
        const next = { ...current };
        if (payload.count) next[payload.sessionId] = payload;
        else delete next[payload.sessionId];
        return next;
      });
      notify('presence', payload);
    });
    socket.on(SESSION_EVENTS.started, (payload) => {
      // Pages compare a session with their clock, which only ticks every half minute: bring it past
      // the moment the news arrived, so the session is drawn as live straight away.
      const receivedAt = Date.now();
      refreshNow();
      notify('started', { ...payload, receivedAt });
      if (payload.by?.id !== user.id) toast(`${payload.session.title} is live now.`, { id: `live-${payload.session.id}`, icon: '🟢' });
    });
    socket.on(SESSION_EVENTS.ended, (payload) => {
      notify('ended', payload);
      if (payload.by?.id !== user.id) toast(`${payload.by?.name ?? 'The teacher'} ended the class.`, { id: `ended-${payload.sessionId}` });
    });
    socket.on(SESSION_EVENTS.reopened, (payload) => notify('reopened', payload));
    socket.on(SESSION_EVENTS.scheduleChanged, (payload) => notify('schedule-changed', payload));
    socket.connect();

    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      socket.disconnect();
    };
  }, [user.id]);

  const value = useMemo(() => ({ status, presence, subscribe }), [status, presence, subscribe]);
  return <LiveSessionsContext.Provider value={value}>{children}</LiveSessionsContext.Provider>;
}

/** `{ status, presence }`: the state of the live connection and who is in each room, by session id. */
export const useLiveSessions = () => useContext(LiveSessionsContext);

/** Calls `handler(type, payload)` for each live event: 'started', 'ended', 'reopened', 'schedule-changed', 'presence', 'resync'. */
export function useSessionEvents(handler) {
  const { subscribe } = useContext(LiveSessionsContext);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => subscribe((type, payload) => latest.current(type, payload)), [subscribe]);
}

/**
 * Keeps a page's list of sessions current. Starts and endings are applied to
 * the list as they are; `reload` (a quiet one) is only called when sessions
 * were rescheduled or the connection was lost for a while. `accept` says
 * whether a newly started session belongs in this list.
 */
export function useLiveSessionList({ setSessions, reload, accept }) {
  useSessionEvents((type, payload) => {
    if (type === 'schedule-changed' || type === 'resync') reload?.(payload);
    else if (type !== 'presence') setSessions((current) => applySessionEvent(current, type, payload, accept));
  });
}
