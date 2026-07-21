import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/auth.js';
import { setTokens, clearTokens, getAccessToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!getAccessToken()) {
      setStatus('unauthenticated');
      return;
    }
    authApi.me()
      .then((u) => { setUser(u); setStatus('authenticated'); })
      .catch(() => { clearTokens(); setStatus('unauthenticated'); });
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    setTokens({ accessToken: data.accessToken, email: data.user.email });
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const acceptInvite = useCallback(async (email, token, password) => {
    const data = await authApi.acceptInvite(email, token, password);
    setTokens({ accessToken: data.accessToken, email: data.user.email });
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* token may already be invalid; clear anyway */ }
    clearTokens();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, acceptInvite, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
