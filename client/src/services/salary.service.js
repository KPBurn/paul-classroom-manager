import { api } from './api.js';

/**
 * Earnings are reported on the browser's own calendar, so a class scheduled in
 * the evening belongs to that day rather than to the next one in UTC.
 */
export const reportingTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const salaryService = {
  async summary(params = {}) {
    const { data } = await api.get('/salary/summary', { params });
    return data.data;
  },

  async teachers(params = {}) {
    const { data } = await api.get('/salary/teachers', { params });
    return data.data;
  },

  async withdrawals(params = {}) {
    const { data } = await api.get('/salary/withdrawals', { params });
    return data.data;
  },

  async requestWithdrawal(withdrawal) {
    const { data } = await api.post('/salary/withdrawals', withdrawal);
    return data.data.withdrawal;
  },

  async reviewWithdrawal(id, review) {
    const { data } = await api.patch(`/salary/withdrawals/${id}`, review);
    return data.data.withdrawal;
  },

  async cancelWithdrawal(id) {
    await api.delete(`/salary/withdrawals/${id}`);
  },
};