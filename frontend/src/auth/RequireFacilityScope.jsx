import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Gates the regular app content (Dashboard/Herd/Upload/Review/Audit) behind
// having an actual facility chosen. Facility-Admin/Staff always have one
// (fixed from their own membership - this guard is a no-op for them).
// Org-Admin's own membership is org-wide (no facility), so they land on
// the Facilities picker until they choose one. super_admin has no fixed
// organization either, so it starts one level higher, at Organizations.
export default function RequireFacilityScope() {
  const { viewScope, isSuperAdmin, membership } = useAuth();
  if (!viewScope.facilityId) {
    if (isSuperAdmin) return <Navigate to="/organizations" replace />;
    if (membership?.roleName === 'Org-Admin') return <Navigate to="/facilities" replace />;
    // Facility-Admin/Staff always have a facility from their own membership -
    // reaching here with none would be a real bug, not a normal picker case.
    return <Navigate to="/select-workspace" replace />;
  }
  return <Outlet />;
}
