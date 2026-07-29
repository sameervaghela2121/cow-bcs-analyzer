import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { authApi } from '../api/auth.js';
import { setTokens, clearTokens, getAccessToken, getViewScope, setViewScope as persistViewScope } from '../api/client.js';

const AuthContext = createContext(null);

// Flattens whichever shape a login/acceptInvite/select-membership response
// gives (nested organization/facility/role objects) down to the same
// {id, organizationId, facilityId, roleName} shape /me returns on reload -
// so every consumer only ever deals with one membership shape, and never
// has to know which endpoint it came from.
function normalizeMembership(membership) {
  if (!membership) return null;
  return {
    id: membership.id,
    organizationId: membership.organization?.id ?? membership.organizationId ?? null,
    facilityId: membership.facility?.id ?? membership.facilityId ?? null,
    roleName: membership.role?.name ?? membership.roleName ?? null,
  };
}

// A fixed membership (Facility-Admin/Staff, or an Org-Admin who has already
// picked a facility) means there's nothing to choose - the view scope is
// just whatever the membership says. Org-Admin's own membership has no
// facility (org-wide), so their scope starts with facilityId: null until
// they pick one via the Facilities page. super_admin has no membership at
// all, so their scope starts fully empty until Organizations -> Facilities.
function scopeFromMembership(membership) {
  if (!membership) return { organizationId: null, facilityId: null };
  return { organizationId: membership.organizationId, facilityId: membership.facilityId };
}

export function AuthProvider({ children }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  // null = logged in but hasn't selected a workspace yet (or none exists) -
  // distinct from `user === null`, which means not logged in at all.
  const [membership, setMembership] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [viewScope, setViewScopeState] = useState(getViewScope());
  const [status, setStatus] = useState('loading');
  const [syncedLocationKey, setSyncedLocationKey] = useState(null);

  const setViewScope = useCallback((scope) => {
    persistViewScope(scope);
    setViewScopeState(scope);
  }, []);

  // Restores whichever facility/organization was in view when *this*
  // history entry was created (attached by useScopedNavigate), rather than
  // whatever's currently selected. Without this, switching facilities and
  // then pressing back would show the new facility's browser history entry
  // but the *old* facility's already-selected view scope - e.g. a stale
  // /herd/1042 entry re-rendering under the wrong facility's data. Done
  // during render (both are this component's own state) so the corrected
  // scope is already in place before any child page mounts and fetches.
  if (location.key !== syncedLocationKey) {
    setSyncedLocationKey(location.key);
    const scoped = location.state;
    if (scoped?.facilityId && (scoped.facilityId !== viewScope.facilityId || scoped.organizationId !== viewScope.organizationId)) {
      const corrected = { organizationId: scoped.organizationId, facilityId: scoped.facilityId };
      persistViewScope(corrected);
      setViewScopeState(corrected);
    }
  }

  useEffect(() => {
    if (!getAccessToken()) {
      setStatus('unauthenticated');
      return;
    }
    authApi.me()
      .then((u) => {
        setUser({ id: u.id, email: u.email, name: u.name, status: u.status });
        setIsSuperAdmin(!!u.isSuperAdmin);
        const normalized = u.membershipId ? normalizeMembership(u) : null;
        setMembership(normalized);
        // Only re-derive the view scope from the membership if nothing was
        // already picked (e.g. an Org-Admin/super_admin's chosen facility,
        // persisted across reload) - don't clobber a real pick with the
        // membership's own (possibly facility-less) default every reload.
        const existing = getViewScope();
        if (!existing.organizationId && !existing.facilityId) {
          setViewScope(scopeFromMembership(normalized));
        } else {
          setViewScopeState(existing);
        }
        setStatus('authenticated');
      })
      .catch(() => { clearTokens(); setStatus('unauthenticated'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    setTokens({ accessToken: data.accessToken });
    setUser(data.user);
    setIsSuperAdmin(!!data.isSuperAdmin);
    const normalized = normalizeMembership(data.membership);
    setMembership(normalized);
    setViewScope(scopeFromMembership(normalized));
    setStatus('authenticated');
    return normalized;
  }, [setViewScope]);

  const acceptInvite = useCallback(async (email, token, password) => {
    const data = await authApi.acceptInvite(email, token, password);
    setTokens({ accessToken: data.accessToken });
    setUser(data.user);
    const normalized = normalizeMembership(data.membership);
    setMembership(normalized);
    setViewScope(scopeFromMembership(normalized));
    setStatus('authenticated');
    return normalized;
  }, [setViewScope]);

  // Called from the workspace picker once the login itself didn't
  // auto-select one (zero or 2+ memberships) - issues the real working
  // session token for whichever membership the user picked.
  const selectMembership = useCallback(async (membershipId) => {
    const data = await authApi.selectMembership(membershipId);
    setTokens({ accessToken: data.accessToken });
    const normalized = normalizeMembership(data.membership);
    setMembership(normalized);
    setViewScope(scopeFromMembership(normalized));
    return normalized;
  }, [setViewScope]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* token may already be invalid; clear anyway */ }
    clearTokens();
    setUser(null);
    setMembership(null);
    setIsSuperAdmin(false);
    setViewScopeState({ organizationId: null, facilityId: null });
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ user, membership, isSuperAdmin, viewScope, setViewScope, status, login, acceptInvite, selectMembership, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
