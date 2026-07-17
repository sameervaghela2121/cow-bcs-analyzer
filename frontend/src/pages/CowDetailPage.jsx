import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { cowsApi } from '../api/cows.js';
import { usePollBcsAnalysis } from '../hooks/usePollBcsAnalysis.js';
import { statusLabel, statusColor, PENDING_STATUSES } from '../domain/analysisStatus.js';
import { formatScore, bandFor } from '../domain/bcs.js';

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function AnalysisImages({ imageUrls }) {
  if (!imageUrls?.length) return null;
  const shown = imageUrls.slice(0, 4);
  const extra = imageUrls.length - shown.length;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {shown.map((url, i) => (
        <img key={i} src={url} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
      ))}
      {extra > 0 && (
        <div style={{ width: 52, height: 52, borderRadius: 8, background: '#efece1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#82796a', flexShrink: 0 }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

// bcsScore.mean_bcs_score is the average of final_bcs across whichever
// providers succeeded (computed server-side in ai-backend) - shown as the
// single overall score rather than breaking it out per-provider.
function MeanScore({ bcsScore }) {
  const score = bcsScore?.mean_bcs_score;
  if (score == null) return null;
  const band = bandFor(score);
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: band.color }}>{formatScore(score)}</div>
      <div style={{ fontSize: 11, color: '#82796a' }}>{band.label}</div>
    </div>
  );
}

// Self-polls every 10s while pending (via usePollBcsAnalysis), stops once
// completed/failed. Records that were already done when the list loaded
// never start polling at all.
function AnalysisRow({ analysis: initial }) {
  const pending = PENDING_STATUSES.has(initial.status);
  const { analysis: polled } = usePollBcsAnalysis(pending ? initial.id : null);
  const analysis = polled || initial;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 14px' }}>
      <AnalysisImages imageUrls={analysis.imageUrls} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{fmtDate(analysis.createdAt)}</div>
        <div style={{ fontSize: 12, color: statusColor(analysis.status), marginTop: 2, fontWeight: 600 }}>
          {statusLabel(analysis.status)}
          {analysis.status === 'failed' && analysis.errorMessage ? `: ${analysis.errorMessage}` : ''}
        </div>
      </div>
      {analysis.status === 'completed' && <MeanScore bcsScore={analysis.bcsScore} />}
    </div>
  );
}

export default function CowDetailPage() {
  const { cowsId } = useParams();
  const navigate = useNavigate();

  const { data: cowData } = useQuery({ queryKey: ['cow', cowsId], queryFn: () => cowsApi.get(cowsId) });
  const { data: analysesData } = useQuery({ queryKey: ['cow-analyses', cowsId], queryFn: () => cowsApi.analyses(cowsId) });

  const cow = cowData?.cow;
  const analyses = analysesData?.bcsAnalyses || [];

  if (!cow) return <div style={{ padding: 28 }}>Loading&hellip;</div>;

  return (
    <div style={{ padding: '28px 28px 60px' }}>
      {/* navigate(-1) instead of a hardcoded '/herd' - so returning from
          here lands back on whatever herd page/search you came from,
          instead of always resetting to page 1. */}
      <div onClick={() => navigate(-1)} style={{ cursor: 'pointer', color: '#166534', fontWeight: 600, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={16} /> Back to herd
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 22px' }}>Cow {cow.cowsId}</h1>

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Upload History</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {analyses.length === 0 && <div style={{ fontSize: 13, color: '#82796a' }}>No uploads yet.</div>}
        {analyses.map((a) => <AnalysisRow key={a.id} analysis={a} />)}
      </div>
    </div>
  );
}
