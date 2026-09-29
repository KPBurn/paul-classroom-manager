import { api } from './api.js';

export const subjectService = {
  async list() {
    const { data } = await api.get('/subjects');
    return data.data.items;
  },

  async get(id) {
    const { data } = await api.get(`/subjects/${id}`);
    return data.data.subject;
  },

  async create(subject) {
    const { data } = await api.post('/subjects', subject);
    return data.data.subject;
  },

  async uploadMaterial(id, file, availableAt) {
    const { data } = await api.post(`/subjects/${id}/materials`, file, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        ...(availableAt && { 'X-Available-At': availableAt }),
      },
    });
    return data.data.material;
  },

  async downloadMaterial(subjectId, materialId) {
    const { data } = await api.get(`/subjects/${subjectId}/materials/${materialId}`, {
      responseType: 'blob',
    });
    return data;
  },
};
