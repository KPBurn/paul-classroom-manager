import { api } from './api.js';

const blobUrl = async (path) => {
  const { data } = await api.get(path, { responseType: 'blob' });
  return URL.createObjectURL(data);
};

export const enrollmentService = {
  /**
   * The classes open for enrollment, with the token the form has to send back
   * when it is submitted: `{ items, formToken }`. Public.
   */
  async openClasses() {
    const { data } = await api.get('/enrollment/classes');
    return data.data;
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

  /** Emails the reference number to whoever applied with this address. The answer is the same either way. */
  async remindReference(email) {
    await api.post('/enrollment/reference', { email });
  },

  async status(details) {
    const { data } = await api.post('/enrollment/status', details);
    return data.data.application;
  },

  async createAccount(details) {
    const { data } = await api.post('/enrollment/account', details);
    return data.data.account;
  },

  // A signed-in student.

  async ownRequests() {
    const { data } = await api.get('/enrollment/requests');
    return data.data.items;
  },

  async requestClasses(request) {
    const { data } = await api.post('/enrollment/requests', request);
    return data.data.application;
  },

  /** Takes back a class request that has not been decided. */
  async withdraw(id, requestId) {
    await api.delete(`/enrollment/requests/${id}/${requestId}`);
  },

  /** What the student gave when they applied, or `null` for an account an administrator made. */
  async ownRecord() {
    const { data } = await api.get('/enrollment/record');
    return data.data.record;
  },

  /** The student's own 2x2 photo as an object URL; revoke it when it is no longer shown. */
  ownPhotoUrl: () => blobUrl('/enrollment/record/photo'),

  // Administrators.

  async list({ page = 1, limit = 20, search, status, classroomId } = {}) {
    const params = { page, limit, ...(search && { search }), ...(status && { status }), ...(classroomId && { classroomId }) };
    const { data } = await api.get('/enrollment/applications', { params });
    return data.data; // { items, pagination, pendingCount }
  },

  /** The enrollment record behind a student's account, or `null` if they did not apply. */
  async recordOf(userId) {
    const { data } = await api.get(`/enrollment/users/${userId}/record`);
    return data.data.record;
  },

  /** The applicant's photo as an object URL; revoke it when it is no longer shown. */
  photoUrl: (id) => blobUrl(`/enrollment/applications/${id}/photo`),

  /** Decides an applicant who has not chosen a class: `{ status, adminNote? }`. */
  async decideApplication(id, decision) {
    const { data } = await api.patch(`/enrollment/applications/${id}`, decision);
    return data.data.application;
  },

  async decide(id, requestId, decision) {
    const { data } = await api.patch(`/enrollment/applications/${id}/requests/${requestId}`, decision);
    return data.data.application;
  },

  /** Undoes a decision so it can be made again; without `requestId`, the decision on an applicant with no class. */
  async reopen(id, requestId) {
    const path = requestId ? `/enrollment/applications/${id}/requests/${requestId}/reopen` : `/enrollment/applications/${id}/reopen`;
    const { data } = await api.post(path);
    return data.data.application;
  },
};
