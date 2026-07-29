import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Access tokens never expire (no refresh flow), so this is the only
// credential to store/clear.
export function getAccessToken() {
  return localStorage.getItem('bcs_access_token');
}
export function setTokens({ accessToken }) {
  localStorage.setItem('bcs_access_token', accessToken);
}
export function clearTokens() {
  localStorage.removeItem('bcs_access_token');
  localStorage.removeItem(VIEW_SCOPE_KEY);
}

// Which organization/facility the signed-in user is currently viewing -
// fixed from their own membership for Facility-Admin/Staff, picked via the
// Organizations/Facilities drill-down for Org-Admin/super_admin. Read fresh
// on every request (not a closed-over value) so it's never stale, the same
// reasoning getAccessToken() already follows. AuthContext is the only thing
// that calls setViewScope/clearViewScope; everything else just rides along
// via this interceptor.
const VIEW_SCOPE_KEY = 'bcs_view_scope';

export function getViewScope() {
  try {
    return JSON.parse(localStorage.getItem(VIEW_SCOPE_KEY)) || { organizationId: null, facilityId: null };
  } catch {
    return { organizationId: null, facilityId: null };
  }
}
export function setViewScope(scope) {
  localStorage.setItem(VIEW_SCOPE_KEY, JSON.stringify(scope));
}
export function clearViewScope() {
  localStorage.removeItem(VIEW_SCOPE_KEY);
}

export const apiClient = axios.create({ baseURL: BASE_URL, adapter: 'fetch' });

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const { organizationId, facilityId } = getViewScope();
  if (organizationId || facilityId) {
    config.params = {
      ...(organizationId ? { organizationId } : {}),
      ...(facilityId ? { facilityId } : {}),
      ...config.params,
    };
  }
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
