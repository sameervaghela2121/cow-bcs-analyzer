import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function RequireAuth() {
  const { status } = useAuth();
  if (status === 'loading') return <div>Loading&hellip;</div>;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  return <Outlet />;
}
