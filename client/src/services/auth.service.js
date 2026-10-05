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

  /** Emails a link for choosing a new password. The answer is the same whether or not the email has an account. */
  async forgotPassword(email) {
    await api.post('/auth/forgot-password', { email });
  },

  /** `token` comes from the emailed link. */
  async resetPassword({ token, password }) {
    await api.post('/auth/reset-password', { token, password });
  },

  /** A teacher's own weekly teaching times. Returns the updated user. */
  async setAvailability(availability) {
    const { data } = await api.put('/auth/availability', { availability });
    return data.data.user;
  },

  async me() {
    const { data } = await api.get('/auth/me');
    return data.data.user;
  },

  async logout() {
    await api.post('/auth/logout');
  },
};
