import { api } from './api.js';

export const systemSettingsService = {
  async get() {
    const { data } = await api.get('/system-settings');
    return data.data;
  },

  async update(settings) {
    const { data } = await api.patch('/system-settings', settings);
    return data.data;
  },
};
