import { apiClient } from './client.js';

export const readingsApi = {
  upload: ({ cowId, files }) => {
    const form = new FormData();
    form.append('cowId', cowId);
    files.forEach((file) => form.append('files', file));
    return apiClient.post('/readings', form).then((r) => r.data);
  },
  get: (id) => apiClient.get(`/readings/${id}`).then((r) => r.data.reading),
};
