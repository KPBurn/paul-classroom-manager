import { api } from './api.js';

export const userService = {
  /** Empty filters are left out of the query string. */
  async list({ page = 1, limit = 20, search, role, status } = {}) {
    const params = { page, limit, ...(search && { search }), ...(role && { role }), ...(status && { status }) };
    const { data } = await api.get('/users', { params });
    return data.data; // { items, pagination }
  },

  async create(user) {
    const { data } = await api.post('/users', user);
    return data.data.user;
  },

  async update(id, changes) {
    const { data } = await api.patch(`/users/${id}`, changes);
    return data.data.user;
  },

  async resetPassword(id, password) {
    await api.put(`/users/${id}/password`, { password });
  },

  async remove(id) {
    await api.delete(`/users/${id}`);
  },
};
