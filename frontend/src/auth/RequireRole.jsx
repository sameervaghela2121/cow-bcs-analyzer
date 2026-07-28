import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Accepts one or more role names, e.g. <RequireRole roles={['Org-Admin', 'Facility-Admin']} />
// - super_admin ("can handle everything") passes every role gate without
// needing to be named explicitly, mirroring the backend's requireRole().
export default function RequireRole({ role, roles }) {
  const { membership, isSuperAdmin } = useAuth();
  if (isSuperAdmin) return <Outlet />;
  const allowed = roles || [role];
  if (!allowed.includes(membership?.roleName)) return <Navigate to="/herd" replace />;
  return <Outlet />;
}
