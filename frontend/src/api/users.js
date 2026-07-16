import { apiClient } from './client.js';

export const usersApi = {
  list: () => apiClient.get('/users').then((r) => r.data.users),
  invite: (payload) => apiClient.post('/users/invite', payload).then((r) => r.data),
  changeRole: (id, role) => apiClient.patch(`/users/${id}/role`, { role }).then((r) => r.data),
  remove: (id) => apiClient.delete(`/users/${id}`).then((r) => r.data),
};
