import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function getAccessToken() {
  return localStorage.getItem('bcs_access_token');
}
function getRefreshToken() {
  return localStorage.getItem('bcs_refresh_token');
}
export function setTokens({ accessToken, refreshToken }) {
  localStorage.setItem('bcs_access_token', accessToken);
  if (refreshToken) localStorage.setItem('bcs_refresh_token', refreshToken);
}
export function clearTokens() {
  localStorage.removeItem('bcs_access_token');
  localStorage.removeItem('bcs_refresh_token');
}

export const apiClient = axios.create({ baseURL: BASE_URL, adapter: 'fetch' });

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retried && getRefreshToken()) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise || axios
          .post(`${BASE_URL}/auth/refresh`, { refreshToken: getRefreshToken() })
          .finally(() => { refreshPromise = null; });
        const { data } = await refreshPromise;
        setTokens({ accessToken: data.accessToken });
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(original);
      } catch (refreshErr) {
        clearTokens();
        throw refreshErr;
      }
    }
    throw error;
  }
);
