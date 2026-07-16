import { apiClient } from './client.js';

export const cowsApi = {
  list: (params = {}) => apiClient.get('/cows', { params }).then((r) => r.data),
  get: (cowId) => apiClient.get(`/cows/${cowId}`).then((r) => r.data),
  readings: (cowId, params = {}) => apiClient.get(`/cows/${cowId}/readings`, { params }).then((r) => r.data),
  create: (payload) => apiClient.post('/cows', payload).then((r) => r.data),
  update: (cowId, payload) => apiClient.patch(`/cows/${cowId}`, payload).then((r) => r.data),
};
