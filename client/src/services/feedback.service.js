import { api } from './api.js';

export const feedbackService = {
  /** Filters: page, limit, classroomId, studentId, teacherId (admins), status, from, to. */
  async list(params = {}) {
    const query = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined));
    const { data } = await api.get('/feedback', { params: query });
    return data.data; // { items, pagination }
  },

  /**
   * Lessons from the last two weeks that still have students waiting for
   * feedback (`items`, newest first), with totals for reminders (`summary`).
   */
  async pending() {
    const { data } = await api.get('/feedback/pending');
    const items = data.data.items ?? [];
    return {
      items,
      summary: data.data.summary ?? {
        lessons: items.length,
        students: items.reduce((total, item) => total + (item.total - item.completed), 0),
        overdueLessons: 0,
        overdueStudents: 0,
      },
    };
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
