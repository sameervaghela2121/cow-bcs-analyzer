import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import TextInput from '../components/ui/TextInput.jsx';
import { color, radius, shadow, font, softTint } from '../styles/tokens.js';

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
    <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: color.bgPage, fontFamily: font.family }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: 380, maxWidth: '90vw', background: color.bgCard, border: `1px solid ${color.borderCard}`,
          borderRadius: radius.card, boxShadow: shadow.card, padding: '36px 32px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 34, height: 34, borderRadius: radius.sm, background: color.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Gauge size={18} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: font.weight.bold, color: color.textPrimary, lineHeight: 1.2 }}>BCS Tracker</div>
            <div style={{ fontSize: 12.5, color: color.textSecondary }}>Staff login</div>
          </div>
        </div>

        <label htmlFor="login-email" style={{ display: 'block', fontSize: 13, fontWeight: font.weight.semibold, color: color.textPrimary, marginBottom: 6 }}>Email</label>
        <TextInput
          id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        <label htmlFor="login-password" style={{ display: 'block', fontSize: 13, fontWeight: font.weight.semibold, color: color.textPrimary, marginBottom: 6 }}>Password</label>
        <TextInput
          id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {error && (
          <div style={{ ...softTint(color.danger), fontSize: 13, fontWeight: 500, padding: '10px 12px', borderRadius: radius.sm, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <Button type="submit" disabled={submitting} size="lg" style={{ width: '100%' }}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </div>
  );
}
