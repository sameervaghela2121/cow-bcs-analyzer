import { useQuery } from '@tanstack/react-query';
// Detail-page navigation (AuditDetailPage.jsx, route /audit/:id) is kept in
// the router for now but no longer opened from here - the row itself
// already shows what changed via the chip + summary text. To restore the
// old click-through-to-detail behavior, add `useNavigate` and an onClick of
// `navigate(`/audit/${entry.id}`)` back onto the row.
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

// "22 July 2026" - day-month-year reads unambiguously to a non-technical
// end user, unlike the US month/day ordering used elsewhere in the app.
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: () => auditApi.list() });
  const entries = data?.entries || [];

  return (
    <div style={{ padding: '32px 32px 60px' }}>
      <PageHeader
        title="Audit Log"
        subtitle="Every score selection and override, most recent first."
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
              style={{ ...cardShellStyle, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: color.textPrimary }}>Cow {entry.cowsId}</div>
                <div style={{ fontSize: 12.5, color: color.textSecondary, marginTop: 2 }}>
                  {fmtDate(entry.createdAt)}{entry.performedBy ? ` • Edited by ${entry.performedBy.name || entry.performedBy.email}` : ''}
                </div>
              </div>
              {/* Chip + text grouped together (not spread across the row) so the
                  gap between them stays the same whether the summary is short
                  ("Gemini: 3.25") or long ("Claude + Gemini + Mean: 3.25"). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <StatusChip tone={entry.action === 'overridden' ? 'warning' : 'ai'} label={meta.label} />
                <div style={{ fontSize: 13.5, color: color.textPrimary, fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {summaryText(entry)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
