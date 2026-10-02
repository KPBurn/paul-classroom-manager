import { api } from './api.js';

export const authService = {
  async login(credentials) {
    const { data } = await api.post('/auth/login', credentials);
    return data.data; // { user, token }
  },

  async roleTestingStatus() {
    const { data } = await api.get('/auth/test-login/status');
    return data.data.roleTestingEnabled;
  },

  async loginWithTestRole(role) {
    const { data } = await api.post('/auth/test-login', { role });
    return data.data;
  },

  /** Returns `{ user, token }`: the new token replaces the one this change invalidated. */
  async changePassword(passwords) {
    const { data } = await api.put('/auth/password', passwords);
    return data.data;
  },

  async me() {
    const { data } = await api.get('/auth/me');
    return data.data.user;
  },

  async logout() {
    await api.post('/auth/logout');
  },
};
