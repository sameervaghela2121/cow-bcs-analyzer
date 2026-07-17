import { apiClient } from './client.js';

export const cowsApi = {
  list: (params = {}) => apiClient.get('/cows', { params }).then((r) => r.data),
  get: (cowsId) => apiClient.get(`/cows/${cowsId}`).then((r) => r.data),
  analyses: (cowsId, params = {}) => apiClient.get(`/cows/${cowsId}/analyses`, { params }).then((r) => r.data),
  create: (payload) => apiClient.post('/cows', payload).then((r) => r.data),
};
