import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, Building2, ClipboardCheck, History, LayoutGrid, LogOut, MapPin, Search, Upload, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useScopedNavigate } from '../auth/useScopedNavigate.js';
import { THEME } from '../domain/bcs.js';
import { cowsApi } from '../api/cows.js';
import { color, font, radius, shadow, transition } from '../styles/tokens.js';
import './AppShell.css';

const APP_CONTENT_NAV_ITEMS = [
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/herd', label: 'Herd', icon: LayoutGrid },
  { to: '/review', label: 'Review', icon: ClipboardCheck },
  { to: '/audit', label: 'Audit Log', icon: History },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
];

// What shows in the sidebar is a function of role *and* whether a facility
// is currently picked, not a fixed list:
// - super_admin always sees Users (every platform user) and Organizations
//   (drill-down into Facilities). The regular Upload/Herd/Review/Audit/
//   Dashboard links only mean something once a facility has actually been
//   picked via that drill-down, so they're added on top the moment
//   viewScope.facilityId is set - at that point a super_admin sees exactly
//   the same facility content a Staff member would, plus the way back up
//   to Users/Organizations.
// - Org-Admin sees the regular app content plus a Facilities link (to
//   switch which of their organization's facilities they're viewing) and
//   Users (their whole organization's team).
// - Facility-Admin sees the regular app content (their one facility is
//   fixed, no switcher needed) plus Users (scoped to that facility).
// - Staff sees just the regular app content.
function navItemsFor({ isSuperAdmin, roleName, facilityId }) {
  if (isSuperAdmin) {
    const items = [
      { to: '/users', label: 'Users', icon: Users },
      { to: '/organizations', label: 'Organizations', icon: Building2 },
    ];
    if (facilityId) items.push(...APP_CONTENT_NAV_ITEMS);
    return items;
  }
  const items = [...APP_CONTENT_NAV_ITEMS];
  if (roleName === 'Org-Admin') items.unshift({ to: '/facilities', label: 'Facilities', icon: MapPin });
  if (roleName === 'Org-Admin' || roleName === 'Facility-Admin') items.push({ to: '/users', label: 'Users', icon: Users });
  return items;
}

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
  const navigate = useScopedNavigate();
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
  const { user, membership, isSuperAdmin, viewScope, logout } = useAuth();
  const navItems = navItemsFor({ isSuperAdmin, roleName: membership?.roleName, facilityId: viewScope.facilityId });
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
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} state={viewScope} className="bcs-nav" style={({ isActive }) => navItemStyle(isActive)}>
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
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
            <div style={{ fontSize: 10.5, color: color.textMuted, textTransform: 'capitalize' }}>{isSuperAdmin ? 'Super Admin' : membership?.roleName === 'Facility-Admin' ? 'Admin' : membership?.roleName}</div>
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
