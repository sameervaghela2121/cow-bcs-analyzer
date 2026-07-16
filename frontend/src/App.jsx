import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import AcceptInvitePage from './pages/AcceptInvitePage.jsx';
import HerdPage from './pages/HerdPage.jsx';
import CowDetailPage from './pages/CowDetailPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
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
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/herd" element={<HerdPage />} />
          <Route path="/herd/:cowId" element={<CowDetailPage />} />
          <Route path="/review" element={<ReviewPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
