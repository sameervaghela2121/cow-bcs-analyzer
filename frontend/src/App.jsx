import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import AcceptInvitePage from './pages/AcceptInvitePage.jsx';
import WorkspacePickerPage from './pages/WorkspacePickerPage.jsx';
import OrganizationsPage from './pages/OrganizationsPage.jsx';
import FacilitiesPage from './pages/FacilitiesPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HerdPage from './pages/HerdPage.jsx';
import CowDetailPage from './pages/CowDetailPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import AuditDetailPage from './pages/AuditDetailPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import AppShell from './components/AppShell.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import RequireMembership from './auth/RequireMembership.jsx';
import RequireFacilityScope from './auth/RequireFacilityScope.jsx';
import RequireRole from './auth/RequireRole.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route element={<RequireAuth />}>
        <Route path="/select-workspace" element={<WorkspacePickerPage />} />
        <Route element={<RequireMembership />}>
          <Route element={<AppShell />}>
            {/* super_admin's drill-down: Organizations -> Facilities -> the
                regular app content below. Org-Admin skips straight to
                Facilities (their organization is already fixed). All still
                render inside AppShell - only which nav items show changes
                by role (see AppShell.jsx). */}
            <Route path="/organizations" element={<OrganizationsPage />} />
            <Route path="/organizations/:orgId/facilities" element={<FacilitiesPage />} />
            <Route path="/facilities" element={<FacilitiesPage />} />
            <Route element={<RequireRole roles={['Org-Admin', 'Facility-Admin']} />}>
              <Route path="/users" element={<UsersPage />} />
            </Route>
            <Route element={<RequireFacilityScope />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/herd" element={<HerdPage />} />
              <Route path="/herd/:cowsId" element={<CowDetailPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/audit/:id" element={<AuditDetailPage />} />
            </Route>
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
