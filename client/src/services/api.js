import axios from 'axios';
import { tokenStorage } from '../utils/tokenStorage.js';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5050/api',
  // Free API hosting sleeps when idle and can take close to a minute to wake up.
  timeout: 60_000,
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let unauthorizedHandler = null;

/** Registers what to do when the API rejects the stored token. Returns an unsubscribe function. */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 while holding a token means the session expired or was revoked.
    // A 401 without one is just a failed login, which the form handles itself.
    if (error.response?.status === 401 && tokenStorage.get()) {
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);
