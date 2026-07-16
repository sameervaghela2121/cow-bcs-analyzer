import { apiClient } from './client.js';

export const reviewApi = {
  queue: () => apiClient.get('/review/queue').then((r) => r.data.items),
  approve: (readingId) => apiClient.post(`/review/${readingId}/approve`).then((r) => r.data),
  override: (readingId, score) => apiClient.post(`/review/${readingId}/override`, { score }).then((r) => r.data),
  stats: () => apiClient.get('/review/stats').then((r) => r.data),
};
