import { api } from './api.js';

export const sessionService = {
  async list(params = {}) {
    const { data } = await api.get('/sessions', { params });
    return data.data.items;
  },

  async messages(id) {
    const { data } = await api.get(`/sessions/${id}/messages`);
    return data.data.items;
  },

  async room(id) {
    const { data } = await api.get(`/sessions/${id}/room`);
    return data.data.session;
  },

  async files(id) {
    const { data } = await api.get(`/sessions/${id}/files`);
    return data.data.items;
  },

  async uploadFile(id, file) {
    const { data } = await api.post(`/sessions/${id}/files`, file, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
    });
    return data.data.file;
  },

  async downloadFile(id, fileId) {
    const { data } = await api.get(`/sessions/${id}/files/${fileId}`, { responseType: 'blob' });
    return data;
  },

  async create(session) {
    const { data } = await api.post('/sessions', session);
    return data.data.items;
  },

  async update(id, changes) {
    const { data } = await api.patch(`/sessions/${id}`, changes);
    return data.data.items;
  },

  async cancel(id, scope) {
    const { data } = await api.post(`/sessions/${id}/cancel`, { scope });
    return data.data.items;
  },

  async checkIn(id) {
    const { data } = await api.post(`/sessions/${id}/check-in`);
    return data.data.session.attendance;
  },

  async attendance(id) {
    const { data } = await api.get(`/sessions/${id}/attendance`);
    return data.data.items;
  },

  async updateAttendance(id, studentId, status) {
    const { data } = await api.patch(`/sessions/${id}/attendance/${studentId}`, { status });
    return data.data.attendance;
  },
};
