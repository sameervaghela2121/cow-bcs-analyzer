import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Gauge } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { authApi } from '../api/auth.js';
import { color, radius, shadow, font, softTint, transition } from '../styles/tokens.js';

// Shown after login when the account doesn't have exactly one membership to
// auto-select - zero (nothing to do yet) or two-plus (needs a pick), the
// same "choose your workspace" step Slack/GitHub/Notion show once a login
// alone doesn't uniquely determine which workspace you're acting in.
export default function WorkspacePickerPage() {
  const { selectMembership } = useAuth();
  const navigate = useNavigate();
  const [memberships, setMemberships] = useState(null);
  const [error, setError] = useState(null);
  const [selectingId, setSelectingId] = useState(null);

  useEffect(() => {
    authApi.listMemberships()
      .then(setMemberships)
      .catch(() => setError('Could not load your workspaces.'));
  }, []);

  async function pick(membershipId) {
    setError(null);
    setSelectingId(membershipId);
    try {
      await selectMembership(membershipId);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Could not select that workspace. Please try again.');
      setSelectingId(null);
    }
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: color.bgPage, fontFamily: font.family }}>
      <div
        style={{
          width: 420, maxWidth: '90vw', background: color.bgCard, border: `1px solid ${color.borderCard}`,
          borderRadius: radius.card, boxShadow: shadow.card, padding: '36px 32px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 34, height: 34, borderRadius: radius.sm, background: color.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Gauge size={18} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: font.weight.bold, color: color.textPrimary, lineHeight: 1.2 }}>Choose a workspace</div>
            <div style={{ fontSize: 12.5, color: color.textSecondary }}>Pick which organization/facility to work in</div>
          </div>
        </div>

        {error && (
          <div style={{ ...softTint(color.danger), fontSize: 13, fontWeight: 500, padding: '10px 12px', borderRadius: radius.sm, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {memberships === null && !error && (
          <div style={{ fontSize: 13.5, color: color.textSecondary }}>Loading your workspaces…</div>
        )}

        {memberships?.length === 0 && (
          <div style={{ fontSize: 13.5, color: color.textSecondary }}>
            You don't have access to any organization yet. Contact your administrator for an invite.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {memberships?.map((m) => (
            <button
              key={m.id}
              onClick={() => pick(m.id)}
              disabled={selectingId != null}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '12px 14px', borderRadius: radius.input, border: `1px solid ${color.border}`,
                background: color.bgCard, cursor: selectingId != null ? 'default' : 'pointer',
                opacity: selectingId != null && selectingId !== m.id ? 0.5 : 1, transition,
              }}
            >
              <Building2 size={18} color={color.textMuted} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: color.textPrimary }}>{m.organization.name}</div>
                <div style={{ fontSize: 12, color: color.textSecondary }}>
                  {m.facility ? m.facility.name : 'All facilities'} · {m.role.name === 'Facility-Admin' ? 'Admin' : m.role.name}
                </div>
              </div>
              {selectingId === m.id && <span style={{ fontSize: 12, color: color.textMuted }}>Loading…</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
