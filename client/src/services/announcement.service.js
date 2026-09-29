import { api } from './api.js';

export const announcementService = {
  async list({ page = 1, limit = 20 } = {}) {
    const { data } = await api.get('/announcements', { params: { page, limit } });
    return data.data; // { items, pagination }
  },

  async create(announcement) {
    const { data } = await api.post('/announcements', announcement);
    return data.data.announcement;
  },
};
