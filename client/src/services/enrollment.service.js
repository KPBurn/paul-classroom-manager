import { api } from './api.js';

export const enrollmentService = {
  /** The classes that can be applied for. Public. */
  async classes() {
    const { data } = await api.get('/enrollment/classes');
    return data.data.items;
  },

  /** Returns `{ referenceNumber, status }`. */
  async submit(application) {
    const { data } = await api.post('/enrollment/applications', application);
    return data.data.application;
  },

  async uploadPhoto(referenceNumber, blob) {
    await api.post(`/enrollment/applications/${referenceNumber}/photo`, blob, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  },

  async status(details) {
    const { data } = await api.post('/enrollment/status', details);
    return data.data.application;
  },

  async createAccount(details) {
    const { data } = await api.post('/enrollment/account', details);
    return data.data.account;
  },

  // A signed-in student asking for another class.

  async ownRequests() {
    const { data } = await api.get('/enrollment/requests');
    return data.data.items;
  },

  async requestClasses(request) {
    const { data } = await api.post('/enrollment/requests', request);
    return data.data.application;
  },

  // Administrators.

  async list({ page = 1, limit = 20, search, status, classroomId } = {}) {
    const params = { page, limit, ...(search && { search }), ...(status && { status }), ...(classroomId && { classroomId }) };
    const { data } = await api.get('/enrollment/applications', { params });
    return data.data; // { items, pagination, pendingCount }
  },

  /** The applicant's photo as an object URL; revoke it when it is no longer shown. */
  async photoUrl(id) {
    const { data } = await api.get(`/enrollment/applications/${id}/photo`, { responseType: 'blob' });
    return URL.createObjectURL(data);
  },

  /** Decides an applicant who has not chosen a class: `{ status, adminNote? }`. */
  async decideApplication(id, decision) {
    const { data } = await api.patch(`/enrollment/applications/${id}`, decision);
    return data.data.application;
  },

  async decide(id, requestId, decision) {
    const { data } = await api.patch(`/enrollment/applications/${id}/requests/${requestId}`, decision);
    return data.data.application;
  },
};
