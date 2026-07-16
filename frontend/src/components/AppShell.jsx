import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { THEMES } from '../domain/bcs.js';
import { reviewApi } from '../api/review.js';
import './AppShell.css';

const navBase = { padding: '10px 12px', borderRadius: 8, fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10, color: '#eee8d8', textDecoration: 'none' };
const navActive = { ...navBase, background: '#33443a' };

export default function AppShell() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState('light');
  const isAdmin = user?.role === 'admin';
  const rootStyle = { ...THEMES[theme], display: 'flex', height: '100%', width: '100%', background: 'var(--bg-page)', color: 'var(--text-primary)' };
  const { data: queueItems } = useQuery({ queryKey: ['review-queue'], queryFn: reviewApi.queue });
  const flaggedCount = queueItems?.length || 0;

  return (
    <div style={rootStyle}>
      <div className="bcs-sidebar" style={{ width: 216, flexShrink: 0, background: '#1c2a20', color: '#eee8d8', display: 'flex', flexDirection: 'column', padding: '22px 14px', gap: 2 }}>
        <div className="bcs-logo" style={{ fontSize: 17, fontWeight: 700, padding: '2px 10px 22px' }}>BCS Tracker</div>
        <NavLink to="/upload" className="bcs-nav" style={({ isActive }) => (isActive ? navActive : navBase)}>Upload</NavLink>
        <NavLink to="/herd" className="bcs-nav" style={({ isActive }) => (isActive ? navActive : navBase)}>Herd</NavLink>
        <NavLink to="/review" className="bcs-nav" style={({ isActive }) => ({ ...(isActive ? navActive : navBase), position: 'relative' })}>
          Review
          {flaggedCount > 0 && (
            <span style={{ background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 10, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', marginLeft: 'auto' }}>
              {flaggedCount}
            </span>
          )}
        </NavLink>
        <NavLink to="/audit" className="bcs-nav" style={({ isActive }) => (isActive ? navActive : navBase)}>Audit Log</NavLink>
        {isAdmin && (
          <NavLink to="/users" className="bcs-nav" style={({ isActive }) => (isActive ? navActive : navBase)}>User Management</NavLink>
        )}
        <div className="bcs-sidebar-user" style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 8, background: '#26362b' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#33443a', color: '#eee8d8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
            {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#eee8d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || user?.email}</div>
            <div style={{ fontSize: 10.5, color: '#9a9280', textTransform: 'capitalize' }}>{user?.role}</div>
          </div>
        </div>
        <div className="bcs-sidebar-footer" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#c9c2ae', padding: '7px 8px', borderRadius: 6, background: '#26362b' }}>
          <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
        </div>
        <div className="bcs-sidebar-footer" onClick={logout} style={{ cursor: 'pointer', fontSize: '11.5px', color: '#c9c2ae', marginTop: 10 }}>Log out</div>
      </div>
      <div className="bcs-main" style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
