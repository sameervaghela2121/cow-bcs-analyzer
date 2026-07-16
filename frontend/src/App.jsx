import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import AcceptInvitePage from './pages/AcceptInvitePage.jsx';
import HerdPage from './pages/HerdPage.jsx';
import AppShell from './components/AppShell.jsx';
import RequireAuth from './auth/RequireAuth.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/herd" replace />} />
          <Route path="/herd" element={<HerdPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
