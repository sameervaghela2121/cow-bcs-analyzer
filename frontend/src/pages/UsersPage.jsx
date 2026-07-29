import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Mail, Trash2, User, UserPlus } from 'lucide-react';
import { usersApi } from '../api/users.js';
import { rolesApi } from '../api/roles.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { Button, PageHeader, StatusChip, TextInput } from '../components/ui/index.js';
import { color, font, radius, shadow, transition } from '../styles/tokens.js';

const cardShellStyle = {
  background: color.bgCard,
  border: `1px solid ${color.borderCard}`,
  borderRadius: radius.card,
  boxShadow: shadow.card,
  transition,
};

const selectStyle = {
  appearance: 'none', WebkitAppearance: 'none', fontFamily: font.family,
  borderRadius: radius.input, border: `1px solid ${color.border}`, fontSize: 14, background: color.bgCard,
  cursor: 'pointer', color: color.textPrimary,
};

function SkeletonUserRow() {
  return (
    <div style={{ ...cardShellStyle, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <Skeleton width={110} height={14.5} style={{ marginBottom: 7 }} />
        <Skeleton width={170} height={12.5} />
      </div>
      <Skeleton width={90} height={34} radius={radius.input} />
      <Skeleton width={36} height={36} radius={radius.input} />
    </div>
  );
}

// super_admin's view: read-only, every platform user with every
// organization/facility/role they hold - there's no single organization to
// scope an invite form to, so inviting from here isn't offered (use a
// specific organization's own Users tab instead, once you're a member of it).
function GlobalUsersList({ users, isLoading }) {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 28px 60px' }}>
      <PageHeader title="Users" subtitle="Every user on the platform, across every organization." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonUserRow key={i} />)}
        {!isLoading && users.map((u) => (
          <div key={u.id} style={{ ...cardShellStyle, padding: '14px 18px' }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: color.textPrimary }}>{u.name}</div>
            <div style={{ fontSize: 12.5, color: color.textSecondary, marginTop: 2, marginBottom: u.memberships.length ? 10 : 0 }}>{u.email}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {u.memberships.map((m) => (
                <StatusChip
                  key={m.id}
                  tone="neutral"
                  label={`${m.organization.name}${m.facility ? ` · ${m.facility.name}` : ''} · ${m.role.name}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user, membership, isSuperAdmin } = useAuth();
  // Facility-Admin narrows the org-wide membership list down to just their
  // own facility; Org-Admin/super_admin pass no extra filter.
  const listParams = membership?.roleName === 'Facility-Admin' ? { facilityId: membership.facilityId } : {};
  const { data, isLoading } = useQuery({ queryKey: ['users', listParams], queryFn: () => usersApi.list(listParams) });
  const { data: allRoles = [] } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list, enabled: !isSuperAdmin });
  // A Facility-Admin can only grant roles within their own facility - Staff
  // or another Facility-Admin - never Org-Admin (org-wide scope is the
  // super_admin/Org-Admin's call, not theirs to hand out). Backend already
  // rejects this via assertRoleGrantable(); hiding it here just keeps the
  // dropdown honest about what will actually be accepted.
  const roles = membership?.roleName === 'Facility-Admin'
    ? allRoles.filter((r) => r.name !== 'Org-Admin')
    : allRoles;
  const myEmail = (user?.email || '').trim().toLowerCase();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState(null);

  // Default the invite form's role to "Staff" once roles have loaded, since
  // that's the base operational role most invites are for.
  useEffect(() => {
    if (!roleId && roles.length > 0) {
      setRoleId((roles.find((r) => r.name === 'Staff') || roles[0]).id);
    }
  }, [roles, roleId]);

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  function facilityIdForRole(id) {
    const role = roles.find((r) => r.id === id);
    // "Org-Admin" is org-wide (no facility); every other role is scoped to
    // the inviting admin's own facility - there's no facility-picker UI yet,
    // so a facility_admin/staff invite always lands in the inviter's own facility.
    return role?.name === 'Org-Admin' ? null : membership?.facilityId;
  }

  async function sendInvite(e) {
    e.preventDefault();
    setError(null);
    try {
      await usersApi.invite({ email, name, roleId, facilityId: facilityIdForRole(roleId) });
      setEmail(''); setName('');
      refetch();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send invite.');
    }
  }

  async function changeRole(membershipId, newRoleId) {
    await usersApi.changeRole(membershipId, newRoleId);
    refetch();
  }
  async function remove(membershipId) {
    await usersApi.remove(membershipId);
    refetch();
  }

  if (isSuperAdmin) {
    return <GlobalUsersList users={data?.users || []} isLoading={isLoading} />;
  }

  const memberships = data?.memberships || [];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 28px 60px' }}>
      <PageHeader title="User Management" subtitle="Invite staff by email and manage roles." />

      <form
        onSubmit={sendInvite}
        style={{ ...cardShellStyle, padding: 24, marginBottom: 28 }}
      >
        <div style={{ fontSize: font.size.cardTitle, fontWeight: font.weight.semibold, color: color.textPrimary, marginBottom: 16 }}>
          Invite a user
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label htmlFor="invite-name" style={{ display: 'none' }}>Name</label>
          <div style={{ position: 'relative' }}>
            <User size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: color.textMuted, pointerEvents: 'none' }} />
            <TextInput
              id="invite-name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)}
              style={{ width: 180, paddingLeft: 38 }}
            />
          </div>
          <label htmlFor="invite-email" style={{ display: 'none' }}>Email</label>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Mail size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: color.textMuted, pointerEvents: 'none' }} />
            <TextInput
              id="invite-email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <select
              value={roleId} onChange={(e) => setRoleId(e.target.value)}
              style={{ ...selectStyle, padding: '11px 34px 11px 14px' }}
            >
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <ChevronDown size={15} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: color.textMuted, pointerEvents: 'none' }} />
          </div>
          <Button type="submit" icon={UserPlus}>
            Send invite
          </Button>
        </div>
        {error && (
          <div style={{ background: '#FDECEC', color: color.danger, fontSize: 13, padding: '9px 12px', borderRadius: radius.sm, marginTop: 14 }}>
            {error}
          </div>
        )}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonUserRow key={i} />)}
        {!isLoading && memberships.map((m) => {
          const isSelf = !!myEmail && m.user?.email?.trim().toLowerCase() === myEmail;
          return (
            <div key={m.id} style={{ ...cardShellStyle, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: color.textPrimary, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {m.user?.name}
                  {isSelf && <StatusChip tone="neutral" label="You" />}
                </div>
                <div style={{ fontSize: 12.5, color: color.textSecondary, marginTop: 2 }}>{m.user?.email}</div>
              </div>
              <div style={{ position: 'relative' }}>
                <select
                  value={m.role?.id || ''} onChange={(e) => changeRole(m.id, e.target.value)}
                  disabled={isSelf}
                  title={isSelf ? "You can't change your own role" : undefined}
                  style={{
                    ...selectStyle, padding: '8px 30px 8px 12px', fontSize: 13,
                    background: isSelf ? color.hover : color.bgCard,
                    color: isSelf ? color.textMuted : color.textPrimary,
                    cursor: isSelf ? 'not-allowed' : 'pointer',
                  }}
                >
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: color.textMuted, pointerEvents: 'none' }} />
              </div>
              <button
                onClick={() => remove(m.id)}
                disabled={isSelf}
                aria-label={`Remove ${m.user?.name}`}
                title={isSelf ? "You can't remove your own account" : 'Remove'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
                  borderRadius: radius.input, border: `1px solid ${isSelf ? color.border : '#F6C9C9'}`,
                  background: isSelf ? color.hover : '#FDECEC', color: isSelf ? color.textMuted : color.danger,
                  cursor: isSelf ? 'not-allowed' : 'pointer', transition,
                }}
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
