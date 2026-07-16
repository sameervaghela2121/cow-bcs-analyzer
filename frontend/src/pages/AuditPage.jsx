import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/audit.js';
import { formatScore } from '../domain/bcs.js';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AuditPage() {
  const { data } = useQuery({ queryKey: ['audit'], queryFn: () => auditApi.list() });
  const entries = data?.entries || [];

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Audit Log</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Every approval and override.</p>

      {entries.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c2', borderRadius: 12, padding: 40, textAlign: 'center', color: '#82796a' }}>
          No review decisions logged yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((entry, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700 }}>Cow {entry.cowId}</div>
              <div style={{ fontSize: 12, color: '#82796a' }}>{fmtDate(entry.createdAt)}</div>
            </div>
            <span style={{
              fontSize: '11.5px', fontWeight: 700, padding: '4px 9px', borderRadius: 999,
              color: entry.action === 'overridden' ? '#b45309' : '#166534',
              background: entry.action === 'overridden' ? '#fdf1de' : '#e6f2e8',
            }}>
              {entry.action === 'overridden' ? 'Overridden' : 'Approved'}
            </span>
            <div style={{ fontSize: 13, color: '#5c5748', minWidth: 120, textAlign: 'right' }}>
              {entry.action === 'overridden'
                ? `${formatScore(entry.oldScore)} → ${formatScore(entry.newScore)}`
                : `Confirmed ${formatScore(entry.oldScore)}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
