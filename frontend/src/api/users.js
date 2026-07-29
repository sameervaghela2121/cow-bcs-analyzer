import { apiClient } from './client.js';

export const usersApi = {
  // Shape depends on the caller's role - { memberships: [...] } for
  // Org-Admin/Facility-Admin (their own organization/facility), or
  // { users: [...] } for super_admin (every platform user, global). Callers
  // branch on which key is present rather than this client guessing.
  list: (params = {}) => apiClient.get('/users', { params }).then((r) => r.data),
  invite: (payload) => apiClient.post('/users/invite', payload).then((r) => r.data),
  changeRole: (membershipId, roleId) => apiClient.patch(`/users/${membershipId}/role`, { roleId }).then((r) => r.data),
  remove: (membershipId) => apiClient.delete(`/users/${membershipId}`).then((r) => r.data),
};
