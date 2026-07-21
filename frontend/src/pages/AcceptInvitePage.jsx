import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import TextInput from '../components/ui/TextInput.jsx';
import { color, radius, shadow, font, softTint } from '../styles/tokens.js';

export default function AcceptInvitePage() {
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await acceptInvite(email, token, password);
      navigate('/herd', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not activate your account.');
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
            <div style={{ fontSize: 16, fontWeight: font.weight.bold, color: color.textPrimary, lineHeight: 1.2 }}>Activate your account</div>
            <div style={{ fontSize: 12.5, color: color.textSecondary }}>{email}</div>
          </div>
        </div>

        <label htmlFor="invite-password" style={{ display: 'block', fontSize: 13, fontWeight: font.weight.semibold, color: color.textPrimary, marginBottom: 6 }}>New password</label>
        <TextInput
          id="invite-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {error && (
          <div style={{ ...softTint(color.danger), fontSize: 13, fontWeight: 500, padding: '10px 12px', borderRadius: radius.sm, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <Button type="submit" disabled={submitting} size="lg" style={{ width: '100%' }}>
          {submitting ? 'Setting password…' : 'Set password & log in'}
        </Button>
      </form>
    </div>
  );
}
