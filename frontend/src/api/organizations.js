import { apiClient } from './client.js';

export const organizationsApi = {
  list: () => apiClient.get('/organizations').then((r) => r.data.organizations),
  create: (name) => apiClient.post('/organizations', { name }).then((r) => r.data.organization),
};
