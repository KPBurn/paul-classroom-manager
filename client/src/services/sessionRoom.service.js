import { io } from 'socket.io-client';
import { api } from './api.js';

export function connectToSessionRoom(token) {
  const serverUrl = new URL(api.defaults.baseURL, window.location.origin);
  return io(serverUrl.origin, {
    auth: { token },
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });
}
