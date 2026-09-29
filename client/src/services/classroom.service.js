import { api } from './api.js';

export const classroomService = {
  async list({ includeArchived = false } = {}) {
    const { data } = await api.get('/classrooms', { params: includeArchived ? { includeArchived: true } : {} });
    return data.data.items;
  },

  async create(classroom) {
    const { data } = await api.post('/classrooms', classroom);
    return data.data.classroom;
  },

  async update(id, changes) {
    const { data } = await api.patch(`/classrooms/${id}`, changes);
    return data.data.classroom;
  },

  async archive(id) {
    const { data } = await api.post(`/classrooms/${id}/archive`);
    return data.data.classroom;
  },
};
