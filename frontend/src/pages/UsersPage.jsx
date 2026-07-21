import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Mail, Trash2, User, UserPlus } from 'lucide-react';
import { usersApi } from '../api/users.js';
import { getStoredUserEmail } from '../api/client.js';
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

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  // The signed-in user's own email, stashed in localStorage at login - used
  // to stop someone from demoting or deleting their own account, which would
  // otherwise strand them (or an admin locking themselves out entirely).
  const myEmail = (getStoredUserEmail() || '').trim().toLowerCase();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [error, setError] = useState(null);

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  async function sendInvite(e) {
    e.preventDefault();
    setError(null);
    try {
      await usersApi.invite({ email, name, role });
      setEmail(''); setName(''); setRole('staff');
      refetch();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send invite.');
    }
  }

  async function changeRole(id, newRole) {
    await usersApi.changeRole(id, newRole);
    refetch();
  }
  async function remove(id) {
    await usersApi.remove(id);
    refetch();
  }

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
              value={role} onChange={(e) => setRole(e.target.value)}
              style={{ ...selectStyle, padding: '11px 34px 11px 14px' }}
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
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
        {!isLoading && users.map((u) => {
          const isSelf = !!myEmail && u.email?.trim().toLowerCase() === myEmail;
          return (
            <div key={u.id} style={{ ...cardShellStyle, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: color.textPrimary, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {u.name}
                  {isSelf && <StatusChip tone="neutral" label="You" />}
                </div>
                <div style={{ fontSize: 12.5, color: color.textSecondary, marginTop: 2 }}>{u.email}</div>
              </div>
              <div style={{ position: 'relative' }}>
                <select
                  value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                  disabled={isSelf}
                  title={isSelf ? "You can't change your own role" : undefined}
                  style={{
                    ...selectStyle, padding: '8px 30px 8px 12px', fontSize: 13,
                    background: isSelf ? color.hover : color.bgCard,
                    color: isSelf ? color.textMuted : color.textPrimary,
                    cursor: isSelf ? 'not-allowed' : 'pointer',
                  }}
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: color.textMuted, pointerEvents: 'none' }} />
              </div>
              <button
                onClick={() => remove(u.id)}
                disabled={isSelf}
                aria-label={`Remove ${u.name}`}
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
