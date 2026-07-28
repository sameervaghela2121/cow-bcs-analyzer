import { apiClient } from './client.js';

export const rolesApi = {
  list: () => apiClient.get('/roles').then((r) => r.data.roles),
};
