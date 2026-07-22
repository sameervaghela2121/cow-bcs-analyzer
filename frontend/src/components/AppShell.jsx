import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, ClipboardCheck, History, LayoutGrid, LogOut, Search, Upload, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { THEME } from '../domain/bcs.js';
import { cowsApi } from '../api/cows.js';
import { color, font, radius, shadow, transition } from '../styles/tokens.js';
import './AppShell.css';

const NAV_ITEMS = [
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/herd', label: 'Herd', icon: LayoutGrid },
  { to: '/review', label: 'Review', icon: ClipboardCheck },
  { to: '/audit', label: 'Audit Log', icon: History },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
];

function navItemStyle(isActive) {
  return {
    padding: '9px 12px',
    borderRadius: radius.sm,
    fontSize: 13.5,
    fontWeight: isActive ? font.weight.semibold : font.weight.medium,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: isActive ? color.primaryDark : color.textSecondary,
    background: isActive ? color.primarySoft : 'transparent',
    textDecoration: 'none',
    transition,
    position: 'relative',
  };
}

// Global "jump to a cow" search that lives in the top bar - the one thing a
// vet or farm manager needs from any screen without hunting through the
// herd grid first. Debounced the same way HerdPage/UploadPage's own
// cow-ID search is.
function GlobalCowSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const { cows } = await cowsApi.list({ search: q, limit: 6 });
        if (requestId.current === id) setResults(cows);
      } catch {
        if (requestId.current === id) setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function goTo(cowsId) {
    navigate(`/herd/${cowsId}`);
    setQuery('');
    setResults([]);
    setOpen(false);
  }
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const rootStyle = { ...THEME, display: 'flex', height: '100%', width: '100%', background: color.bgPage, color: color.textPrimary, fontFamily: font.family };

  return (
    <div style={rootStyle}>
      <div
        className="bcs-sidebar"
        style={{
          width: 232, flexShrink: 0, background: color.bgCard, borderRight: `1px solid ${color.borderCard}`,
          display: 'flex', flexDirection: 'column', padding: '20px 14px',
        }}
      >
        <div className="bcs-logo" style={{ fontSize: 20, fontWeight: 700, padding: '2px 8px 24px', display: 'flex', alignItems: 'center', gap: 10, color: color.textPrimary }}>
          <img src="/cow-logo.png" alt="" style={{ width: 42, height: 42, objectFit: 'contain', borderRadius: 10 }} />
          BCS Tracker
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="bcs-nav" style={({ isActive }) => navItemStyle(isActive)}>
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/users" className="bcs-nav" style={({ isActive }) => navItemStyle(isActive)}>
              <Users size={16} strokeWidth={1.75} /> User
            </NavLink>
          )}
        </div>

        <div
          className="bcs-sidebar-user"
          style={{
            marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px',
            borderRadius: radius.sm, borderTop: `1px solid ${color.borderCard}`, paddingTop: 16,
          }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: '50%', background: color.primarySoft, color: color.primaryDark,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}
          >
            {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: color.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || user?.email}
            </div>
            <div style={{ fontSize: 10.5, color: color.textMuted, textTransform: 'capitalize' }}>{user?.role}</div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: radius.sm, border: 'none', background: 'transparent',
              color: color.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          className="bcs-topbar"
          style={{
            height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            padding: '0 28px', borderBottom: `1px solid ${color.borderCard}`, background: color.bgCard,
          }}
        >
          <GlobalCowSearch />
        </div>
        <div className="bcs-main" style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
