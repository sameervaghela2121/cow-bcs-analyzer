import { apiClient } from './client.js';

export const authApi = {
  login: (email, password) => apiClient.post('/auth/login', { email, password }).then((r) => r.data),
  acceptInvite: (email, token, password) =>
    apiClient.post('/auth/accept-invite', { email, token, password }).then((r) => r.data),
  me: () => apiClient.get('/auth/me').then((r) => r.data),
  logout: () => apiClient.post('/auth/logout').then((r) => r.data),
};
