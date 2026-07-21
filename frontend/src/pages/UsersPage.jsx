import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Mail, Trash2, User, UserPlus } from 'lucide-react';
import { usersApi } from '../api/users.js';
import Skeleton from '../components/Skeleton.jsx';

function SkeletonUserRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <Skeleton width={110} height={14.5} style={{ marginBottom: 7 }} />
        <Skeleton width={170} height={12.5} />
      </div>
      <Skeleton width={90} height={34} radius={8} />
      <Skeleton width={36} height={36} radius={8} />
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
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
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>User Management</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Invite staff by email and manage roles.</p>

      <form onSubmit={sendInvite} style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, padding: 22, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Invite a user</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label htmlFor="invite-name" style={{ display: 'none' }}>Name</label>
          <div style={{ position: 'relative' }}>
            <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#a39c86', pointerEvents: 'none' }} />
            <input
              id="invite-name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)}
              style={{ padding: '11px 14px 11px 36px', borderRadius: 9, border: '1px solid #d8d2c2', fontSize: 14 }}
            />
          </div>
          <label htmlFor="invite-email" style={{ display: 'none' }}>Email</label>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#a39c86', pointerEvents: 'none' }} />
            <input
              id="invite-email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px 11px 36px', borderRadius: 9, border: '1px solid #d8d2c2', fontSize: 14 }}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <select
              value={role} onChange={(e) => setRole(e.target.value)}
              style={{ appearance: 'none', WebkitAppearance: 'none', padding: '11px 34px 11px 14px', borderRadius: 9, border: '1px solid #d8d2c2', fontSize: 14, background: '#fff', cursor: 'pointer' }}
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <ChevronDown size={15} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: '#a39c86', pointerEvents: 'none' }} />
          </div>
          <button
            type="submit"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 9, border: 'none', background: '#1c2a20', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            <UserPlus size={16} /> Send invite
          </button>
        </div>
        {error && <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '9px 12px', borderRadius: 8, marginTop: 12 }}>{error}</div>}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonUserRow key={i} />)}
        {!isLoading && users.map((u) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: '14px 18px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{u.name}</div>
              <div style={{ fontSize: '12.5px', color: '#82796a' }}>{u.email}</div>
            </div>
            <div style={{ position: 'relative' }}>
              <select
                value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                style={{ appearance: 'none', WebkitAppearance: 'none', padding: '8px 30px 8px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 13, background: '#fff', cursor: 'pointer' }}
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#a39c86', pointerEvents: 'none' }} />
            </div>
            <button
              onClick={() => remove(u.id)}
              aria-label={`Remove ${u.name}`}
              title="Remove"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
                borderRadius: 8, border: '1px solid #f2d9d9', background: '#fdf3f3', color: '#b91c1c', cursor: 'pointer',
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
