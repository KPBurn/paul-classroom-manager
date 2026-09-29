import { api } from './api.js';

export const announcementService = {
  async list({ page = 1, limit = 20, status = 'active' } = {}) {
    const { data } = await api.get('/announcements', { params: { page, limit, status } });
    return data.data; // { items, pagination }
  },

  async create(announcement) {
    const { data } = await api.post('/announcements', announcement);
    return data.data.announcement;
  },

  async update(id, changes) {
    const { data } = await api.patch(`/announcements/${id}`, changes);
    return data.data.announcement;
  },

  async archive(id) {
    const { data } = await api.post(`/announcements/${id}/archive`);
    return data.data.announcement;
  },

  async restore(id) {
    const { data } = await api.post(`/announcements/${id}/restore`);
    return data.data.announcement;
  },

  async remove(id) {
    await api.delete(`/announcements/${id}`);
  },
};
