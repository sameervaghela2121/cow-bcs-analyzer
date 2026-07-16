import { apiClient } from './client.js';

export const readingsApi = {
  upload: ({ cowId, file }) => {
    const form = new FormData();
    form.append('cowId', cowId);
    form.append('file', file);
    return apiClient.post('/readings', form).then((r) => r.data);
  },
  get: (id) => apiClient.get(`/readings/${id}`).then((r) => r.data.reading),
};
