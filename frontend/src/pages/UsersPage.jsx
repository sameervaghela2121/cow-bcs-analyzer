import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users.js';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
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
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>User Management</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Invite staff by email and manage roles.</p>

      <form onSubmit={sendInvite} style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: 18, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Invite a user</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label htmlFor="invite-name" style={{ display: 'none' }}>Name</label>
          <input id="invite-name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2' }} />
          <label htmlFor="invite-email" style={{ display: 'none' }}>Email</label>
          <input id="invite-email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 160, padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2' }} />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2' }}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Send invite</button>
        </div>
        {error && <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '9px 12px', borderRadius: 8, marginTop: 12 }}>{error}</div>}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {users.map((u) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{u.name}</div>
              <div style={{ fontSize: '12.5px', color: '#82796a' }}>{u.email}</div>
            </div>
            <span style={{
              fontSize: '11.5px', fontWeight: 700, padding: '4px 10px', borderRadius: 999,
              color: u.status === 'active' ? '#166534' : '#92600a',
              background: u.status === 'active' ? '#e6f2e8' : '#fdf3d9',
            }}>
              {u.status === 'active' ? 'Active' : 'Pending'}
            </span>
            <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #d8d2c2' }}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={() => remove(u.id)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', color: '#b91c1c', fontWeight: 600, cursor: 'pointer' }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
