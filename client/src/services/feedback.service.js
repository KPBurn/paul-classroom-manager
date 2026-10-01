import { api } from './api.js';

export const feedbackService = {
  /** Filters: page, limit, classroomId, studentId, teacherId (admins), status, from, to. */
  async list(params = {}) {
    const query = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined));
    const { data } = await api.get('/feedback', { params: query });
    return data.data; // { items, pagination }
  },

  /** Recent lessons that still have students waiting for feedback, with the next student to open. */
  async pending() {
    const { data } = await api.get('/feedback/pending');
    return data.data.items;
  },

  /** A lesson's students with their feedback status, plus the last book used for the class. */
  async lesson(sessionId) {
    const { data } = await api.get(`/feedback/lessons/${sessionId}`);
    return data.data; // { lesson, students, suggestedBook }
  },

  async get(id) {
    const { data } = await api.get(`/feedback/${id}`);
    return data.data.feedback;
  },

  async create(feedback) {
    const { data } = await api.post('/feedback', feedback);
    return data.data.feedback;
  },

  async update(id, changes) {
    const { data } = await api.patch(`/feedback/${id}`, changes);
    return data.data.feedback;
  },
};
