import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { auditApi } from '../api/audit.js';
import { formatScore, describeFinalScore, REVIEW_ACTION_META } from '../domain/bcs.js';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function summaryText(entry) {
  if (entry.action === 'overridden') {
    const after = entry.after?.final_bcs;
    if (after == null) return null;
    const before = entry.before?.final_bcs;
    return before != null ? `${formatScore(before)} → ${formatScore(after)}` : `Overridden to ${formatScore(after)}`;
  }
  // provider_selected - describeFinalScore reads {bcsScore, final_bcs} off
  // any object shaped like an analysis, which entry.after already is (see
  // backend auditService.snapshotBcsAnalysis).
  const final = describeFinalScore(entry.after);
  return final ? `${final.label}: ${formatScore(final.score)}` : null;
}

export default function AuditPage() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['audit'], queryFn: () => auditApi.list() });
  const entries = data?.entries || [];

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Audit Log</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Every score selection and override - click a row for the full before/after detail.</p>

      {entries.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c2', borderRadius: 12, padding: 40, textAlign: 'center', color: '#82796a' }}>
          No review decisions logged yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((entry) => {
          const meta = REVIEW_ACTION_META[entry.action] || REVIEW_ACTION_META.provider_selected;
          return (
            <div
              key={entry.id}
              onClick={() => navigate(`/audit/${entry.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/audit/${entry.id}`); }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700 }}>Cow {entry.cowsId}</div>
                <div style={{ fontSize: 12, color: '#82796a' }}>
                  {fmtDate(entry.createdAt)}{entry.performedBy ? ` • ${entry.performedBy.name || entry.performedBy.email}` : ''}
                </div>
              </div>
              <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '4px 9px', borderRadius: 999, color: meta.color, background: meta.background }}>
                {meta.label}
              </span>
              <div style={{ fontSize: 13, color: '#5c5748', minWidth: 140, textAlign: 'right' }}>
                {summaryText(entry)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
