import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/herd', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f5f0' }}>
      <form onSubmit={handleSubmit} style={{ width: 360, maxWidth: '90vw', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, padding: '32px 28px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>BCS Tracker</div>
        <div style={{ fontSize: 13, color: '#82796a', marginBottom: 24 }}>Staff login</div>

        <label htmlFor="login-email" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Email</label>
        <input
          id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 15, border: '1px solid #d8d2c2', borderRadius: 8, marginBottom: 16 }}
        />

        <label htmlFor="login-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Password</label>
        <input
          id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 15, border: '1px solid #d8d2c2', borderRadius: 8, marginBottom: 16 }}
        />

        {error && (
          <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
