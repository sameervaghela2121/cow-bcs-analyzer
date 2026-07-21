import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { auditApi } from '../api/audit.js';
import { formatScore, describeFinalScore, REVIEW_ACTION_META } from '../domain/bcs.js';
import Skeleton from '../components/Skeleton.jsx';
import { PageHeader, EmptyState, StatusChip } from '../components/ui/index.js';
import { color, radius, shadow, transition } from '../styles/tokens.js';

const cardShellStyle = {
  background: color.bgCard,
  border: `1px solid ${color.borderCard}`,
  borderRadius: radius.card,
  boxShadow: shadow.card,
  transition,
};

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
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: () => auditApi.list() });
  const entries = data?.entries || [];

  return (
    <div style={{ padding: '32px 32px 60px' }}>
      <PageHeader
        title="Audit Log"
        subtitle="Every score selection and override - click a row for the full before/after detail."
      />

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...cardShellStyle, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skeleton width={90} height={13.5} style={{ marginBottom: 6 }} />
                <Skeleton width={160} height={12} />
              </div>
              <Skeleton width={80} height={22} radius={999} />
              <Skeleton width={100} height={13} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <EmptyState icon={History} title="No review decisions logged yet." description="Approvals, selections, and overrides will show up here as reviewers work through the queue." />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map((entry) => {
          const meta = REVIEW_ACTION_META[entry.action] || REVIEW_ACTION_META.provider_selected;
          return (
            <div
              key={entry.id}
              onClick={() => navigate(`/audit/${entry.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/audit/${entry.id}`); }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = shadow.raised; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = shadow.card; }}
              style={{ ...cardShellStyle, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: color.textPrimary }}>Cow {entry.cowsId}</div>
                <div style={{ fontSize: 12.5, color: color.textSecondary, marginTop: 2 }}>
                  {fmtDate(entry.createdAt)}{entry.performedBy ? ` • ${entry.performedBy.name || entry.performedBy.email}` : ''}
                </div>
              </div>
              <StatusChip tone={entry.action === 'overridden' ? 'warning' : 'ai'} label={meta.label} />
              <div style={{ fontSize: 13.5, color: color.textPrimary, fontWeight: 500, minWidth: 140, textAlign: 'right' }}>
                {summaryText(entry)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
