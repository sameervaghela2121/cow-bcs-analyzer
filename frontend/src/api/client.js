import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Access tokens never expire (no refresh flow), so this is the only
// credential to store/clear. The signed-in user's email rides alongside it
// (not sensitive, just an identity hint) so pages can recognize "this is me"
// without waiting on the async /me call.
export function getAccessToken() {
  return localStorage.getItem('bcs_access_token');
}
export function getStoredUserEmail() {
  return localStorage.getItem('bcs_user_email');
}
export function setTokens({ accessToken, email }) {
  localStorage.setItem('bcs_access_token', accessToken);
  if (email) localStorage.setItem('bcs_user_email', email);
}
export function clearTokens() {
  localStorage.removeItem('bcs_access_token');
  localStorage.removeItem('bcs_user_email');
}

export const apiClient = axios.create({ baseURL: BASE_URL, adapter: 'fetch' });

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 here means the token itself is invalid/revoked (e.g. the user was
// deactivated) - not "expired", since it never expires. Clear it so route
// guards send the user back to the login screen instead of retrying.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) clearTokens();
    throw error;
  }
);
