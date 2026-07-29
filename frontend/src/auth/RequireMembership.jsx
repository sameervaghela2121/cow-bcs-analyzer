import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Gates every "real" app route the same way the backend's requireSession()
// gates every tenant-scoped API call: being logged in (RequireAuth) only
// proves who you are, not which workspace you're acting as - a login-only
// session (0 or 2+ memberships, none selected yet) has no organizationId/
// facilityId to scope anything by, so it's sent to the picker instead.
// super_admin has no membership at all by design - always let it through
// here (it has its own drill-down, gated separately by RequireFacilityScope).
export default function RequireMembership() {
  const { membership, isSuperAdmin } = useAuth();
  if (!membership && !isSuperAdmin) return <Navigate to="/select-workspace" replace />;
  return <Outlet />;
}
