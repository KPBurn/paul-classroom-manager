import { io } from 'socket.io-client';
import { api } from './api.js';
import { tokenStorage } from '../utils/tokenStorage.js';

/** What the server sends about sessions outside the room itself (server: realtime/sessionEvents.js). */
export const SESSION_EVENTS = {
  started: 'session:started',
  ended: 'session:ended',
  reopened: 'session:reopened',
  scheduleChanged: 'session:schedule-changed',
  presence: 'session:presence',
};

/**
 * A connection to the live server. It keeps trying to reconnect for as long as
 * the page is open, and signs in with the token stored at that moment, so it
 * survives a dropped network and a renewed token. A token the server rejects
 * ends the retries.
 */
export function connectToSessionRoom() {
  const serverUrl = new URL(api.defaults.baseURL, window.location.origin);
  return io(serverUrl.origin, {
    auth: (send) => send({ token: tokenStorage.get() }),
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
}
