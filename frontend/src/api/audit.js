import { apiClient } from './client.js';

export const auditApi = {
  list: (params = {}) => apiClient.get('/audit', { params }).then((r) => r.data),
  get: (id) => apiClient.get(`/audit/${id}`).then((r) => r.data),
};
