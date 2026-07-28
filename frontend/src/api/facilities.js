import { apiClient } from './client.js';

export const facilitiesApi = {
  // organizationId only matters for super_admin (drilling into a specific
  // org from the Organizations page) - Org-Admin's own organization is
  // used server-side regardless of what's passed.
  list: (organizationId) =>
    apiClient.get('/facilities', { params: organizationId ? { organizationId } : {} }).then((r) => r.data.facilities),
  create: ({ organizationId, name }) =>
    apiClient.post('/facilities', { organizationId, name }).then((r) => r.data.facility),
};
