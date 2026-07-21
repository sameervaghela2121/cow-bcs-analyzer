import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { auditApi } from '../api/audit.js';
import { formatScore, PROVIDERS, PROVIDER_LABELS, meanOfScores, medianOfScores, REVIEW_ACTION_META } from '../domain/bcs.js';
import Skeleton from '../components/Skeleton.jsx';

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// The audit snapshot only ever stores the raw per-provider scores (see
// backend auditService.snapshotBcsAnalysis) - mean/median are never
// persisted anywhere, so they're recomputed here from that raw data, the
// same way ReviewPage/dashboardStats do (bcs.js's meanOfScores/medianOfScores).
function successfulScoresFrom(bcsScore) {
  return PROVIDERS
    .map((p) => bcsScore?.[p])
    .filter((a) => a?.status === 'success' && a?.final_bcs != null)
    .map((a) => a.final_bcs);
}

// "Not measured" for the before side is the normal case (nothing is ever
// true before a review); "None" means a review did happen but resolved to a
// manual override (matched neither a model nor mean/median).
function pickLabel(matched, isApproved) {
  if (matched.length > 0) return matched.join(', ');
  return isApproved ? 'None' : 'Not measured';
}

// Which AI model(s) matched the reviewer's pick - mirrors bcsScore's
// per-provider is_true flags (see bcsAnalysisController.applySelection).
// Kept separate from statisticsPickLabel below so an actual model match
// (Claude/Gemini/OpenAI) is never lumped in with a Mean/Median match.
function modelPickLabel(snapshot) {
  const matched = Object.entries(PROVIDER_LABELS)
    .filter(([key]) => snapshot?.bcsScore?.[key]?.is_true)
    .map(([, label]) => label);
  return pickLabel(matched, snapshot?.is_approved);
}

// Which computed statistic(s) matched the reviewer's pick - is_mean_true/
// is_median_true, the algorithmic counterpart to modelPickLabel above.
function statisticsPickLabel(snapshot) {
  const matched = [];
  if (snapshot?.bcsScore?.is_mean_true) matched.push('Mean');
  if (snapshot?.bcsScore?.is_median_true) matched.push('Median');
  return pickLabel(matched, snapshot?.is_approved);
}

function DiffRow({ label, before, after }) {
  const changed = before !== after;
  return (
    <div
      data-testid={`audit-diff-row-${label}`}
      style={{
        display: 'grid', gridTemplateColumns: '180px 1fr 24px 1fr', alignItems: 'start', gap: 14,
        padding: '12px 14px', borderRadius: 8,
        background: changed ? '#fdf1de' : 'transparent',
        border: changed ? '1px solid #f0d9ab' : '1px solid transparent',
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, color: changed ? '#92400e' : '#82796a' }}>{label}</div>
      <div style={{ fontSize: 13, color: changed ? '#5c5748' : '#a39c86' }}>{before}</div>
      <div style={{ fontSize: 13, color: '#a39c86', textAlign: 'center' }}>{changed ? '→' : ''}</div>
      <div style={{ fontSize: 13, fontWeight: changed ? 700 : 400, color: changed ? '#166534' : '#a39c86' }}>{after}</div>
    </div>
  );
}

export default function AuditDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['audit', id], queryFn: () => auditApi.get(id) });
  const entry = data?.auditLog;

  if (!entry) {
    return (
      <div style={{ padding: '28px 28px 60px' }}>
        <Skeleton width={70} height={14} style={{ marginBottom: 18 }} />
        <Skeleton width={180} height={24} style={{ marginBottom: 10 }} />
        <Skeleton width={220} height={13.5} style={{ marginBottom: 26 }} />
        <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 24px 1fr', gap: 14, padding: '12px 14px' }}>
                <Skeleton width={90} height={12.5} />
                <Skeleton width="70%" height={13} />
                <div />
                <Skeleton width="70%" height={13} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const meta = REVIEW_ACTION_META[entry.action] || REVIEW_ACTION_META.provider_selected;
  const beforeScores = successfulScoresFrom(entry.before?.bcsScore);
  const afterScores = successfulScoresFrom(entry.after?.bcsScore);

  const rows = [
    { label: 'Approved', before: entry.before?.is_approved ? 'Yes' : 'No', after: entry.after?.is_approved ? 'Yes' : 'No' },
    { label: 'Final BCS Score', before: formatScore(entry.before?.final_bcs), after: formatScore(entry.after?.final_bcs) },
    { label: 'Mean', before: formatScore(meanOfScores(beforeScores)), after: formatScore(meanOfScores(afterScores)) },
    { label: 'Median', before: formatScore(medianOfScores(beforeScores)), after: formatScore(medianOfScores(afterScores)) },
    { label: 'Model', before: modelPickLabel(entry.before), after: modelPickLabel(entry.after) },
    { label: 'Statistics', before: statisticsPickLabel(entry.before), after: statisticsPickLabel(entry.after) },
    { label: 'Status', before: entry.before?.status ?? '—', after: entry.after?.status ?? '—' },
    { label: 'Last Updated By', before: entry.before?.updatedBy ?? '—', after: entry.after?.updatedBy ?? '—' },
  ];

  return (
    <div style={{ padding: '28px 28px 60px' }}>
      <div onClick={() => navigate(-1)} style={{ cursor: 'pointer', color: '#166534', fontWeight: 600, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={16} /> Back
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Cow {entry.cowsId}</h1>
        <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '4px 9px', borderRadius: 999, color: meta.color, background: meta.background }}>
          {meta.label}
        </span>
      </div>
      <p style={{ fontSize: 13.5, color: '#82796a', margin: '0 0 26px' }}>
        {fmtDateTime(entry.createdAt)}
        {entry.performedBy ? ` by ${entry.performedBy.name || entry.performedBy.email}` : ''}
      </p>

      <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 24px 1fr', gap: 14, padding: '0 14px 10px', fontSize: 11, fontWeight: 700, color: '#a39c86', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          <div>Field</div>
          <div>Before</div>
          <div />
          <div>After</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map((row) => (
            <DiffRow key={row.label} label={row.label} before={row.before} after={row.after} />
          ))}
        </div>
      </div>
    </div>
  );
}
