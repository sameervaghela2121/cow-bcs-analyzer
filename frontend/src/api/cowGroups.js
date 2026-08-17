import { apiClient } from './client.js';

export const cowGroupsApi = {
  list: () => apiClient.get('/cow-groups').then((r) => r.data),
};
