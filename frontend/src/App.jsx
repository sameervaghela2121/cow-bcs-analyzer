import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import AcceptInvitePage from './pages/AcceptInvitePage.jsx';
import HerdPage from './pages/HerdPage.jsx';
import CowDetailPage from './pages/CowDetailPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import AppShell from './components/AppShell.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import RequireRole from './auth/RequireRole.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/herd" replace />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/herd" element={<HerdPage />} />
          <Route path="/herd/:cowsId" element={<CowDetailPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route element={<RequireRole role="admin" />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
