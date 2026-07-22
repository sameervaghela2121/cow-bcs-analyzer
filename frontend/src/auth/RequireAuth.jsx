import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { color } from '../styles/tokens.js';

// Shown only for the brief window while AuthContext's /me check is in
// flight on first load/reload - branded rather than a bare "Loading…" text
// or a flash of blank white, since bgPage already matches the app shell
// behind it, this reads as a continuous screen rather than a jarring flash.
function AuthCheckSplash() {
  return (
    <div
      style={{
        height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 18, background: color.bgPage,
      }}
    >
      <img src="/cow-logo.png" alt="" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 10 }} />
      <div
        aria-label="Loading"
        style={{
          width: 26, height: 26, borderRadius: '50%', border: `3px solid ${color.border}`,
          borderTopColor: color.primary, animation: 'bcs-spin 0.8s linear infinite',
        }}
      />
    </div>
  );
}

export default function RequireAuth() {
  const { status } = useAuth();
  if (status === 'loading') return <AuthCheckSplash />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  return <Outlet />;
}
