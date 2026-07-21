import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ClipboardCheck, History, LayoutGrid, LogOut, Upload, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { THEME } from '../domain/bcs.js';
import { reviewBacklog } from '../domain/dashboardStats.js';
import { cowsApi } from '../api/cows.js';
import './AppShell.css';

const navBase = { padding: '10px 12px', borderRadius: 8, fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10, color: '#eee8d8', textDecoration: 'none' };
const navActive = { ...navBase, background: '#33443a' };

export default function AppShell() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const rootStyle = { ...THEME, display: 'flex', height: '100%', width: '100%', background: 'var(--bg-page)', color: 'var(--text-primary)' };
  // Same "cows list" query ReviewPage itself reads (and invalidates on
  // approve) - a cow counts here exactly when ReviewPage would show it:
  // its latest analysis completed but hasn't been approved yet.
  const { data } = useQuery({ queryKey: ['cows'], queryFn: () => cowsApi.list() });
  const flaggedCount = reviewBacklog(data?.cows || []).length;

  return (
    <div style={rootStyle}>
      <div className="bcs-sidebar" style={{ width: 216, flexShrink: 0, background: '#1c2a20', color: '#eee8d8', display: 'flex', flexDirection: 'column', padding: '22px 14px', gap: 2 }}>
        <div className="bcs-logo" style={{ fontSize: 17, fontWeight: 700, padding: '2px 10px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/cow-logo.png" alt="Cow Logo" style={{ width: 48, height: 48, objectFit: 'contain' }} />
          BCS Tracker
        </div>
        <NavLink to="/upload" className="bcs-nav" style={({ isActive }) => (isActive ? navActive : navBase)}>
          <Upload size={16} /> Upload
        </NavLink>
        <NavLink to="/herd" className="bcs-nav" style={({ isActive }) => (isActive ? navActive : navBase)}>
          <LayoutGrid size={16} /> Herd
        </NavLink>
        <NavLink to="/review" className="bcs-nav" style={({ isActive }) => ({ ...(isActive ? navActive : navBase), position: 'relative' })}>
          <ClipboardCheck size={16} /> Review
          {flaggedCount > 0 && (
            <span style={{ background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 10, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', marginLeft: 'auto' }}>
              {flaggedCount}
            </span>
          )}
        </NavLink>
        <NavLink to="/audit" className="bcs-nav" style={({ isActive }) => (isActive ? navActive : navBase)}>
          <History size={16} /> Audit Log
        </NavLink>
        {isAdmin && (
          <NavLink to="/users" className="bcs-nav" style={({ isActive }) => (isActive ? navActive : navBase)}>
            <Users size={16} /> User
          </NavLink>
        )}
        <NavLink to="/dashboard" className="bcs-nav" style={({ isActive }) => (isActive ? navActive : navBase)}>
          <BarChart3 size={16} /> Dashboard
        </NavLink>
        <div className="bcs-sidebar-user" style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 8, background: '#26362b' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#33443a', color: '#eee8d8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
            {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#eee8d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || user?.email}</div>
            <div style={{ fontSize: 10.5, color: '#9a9280', textTransform: 'capitalize' }}>{user?.role}</div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
              color: '#c9c2ae', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
      <div className="bcs-main" style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
