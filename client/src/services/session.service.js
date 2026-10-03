import { api } from './api.js';

export const sessionService = {
  async list(params = {}) {
    const { data } = await api.get('/sessions', { params });
    return data.data.items;
  },

  /**
   * One page of a list, for lists too long to load whole. Pass `limit`, and the
   * `nextCursor` of the page before as `cursor`. Also takes `status`, `search`
   * and `order` ('desc' for newest first).
   */
  async page(params = {}) {
    const { data } = await api.get('/sessions', { params });
    const { items, total, nextCursor } = data.data;
    // An API from before paging answers with the whole list and nothing else.
    return { items, total: total ?? items.length, nextCursor: nextCursor ?? null };
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

  /**
   * Starts a class in this classroom now, with no date to enter. Gives back
   * the session to open; `created` is false when the class was already running.
   */
  async startNow(classroomId) {
    const { data } = await api.post('/sessions/start', { classroomId });
    return data.data;
  },

  async update(id, changes) {
    const { data } = await api.patch(`/sessions/${id}`, changes);
    return data.data.items;
  },

  async cancel(id, scope) {
    const { data } = await api.post(`/sessions/${id}/cancel`, { scope });
    return data.data.items;
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
