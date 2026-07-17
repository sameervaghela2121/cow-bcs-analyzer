import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cowsApi } from '../api/cows.js';
import { bcsAnalysisApi } from '../api/bcsAnalysis.js';
import Badge from '../components/Badge.jsx';
import { formatScore } from '../domain/bcs.js';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

// Backend has no override-persistence endpoint yet - Override is still a
// local-only adjustment: it changes what this row displays, but nothing is
// saved. Approve, though, is real - PATCH /bcs-analysis/:id/approve sets
// is_approved on the record itself, which is what drives this row's
// "Approved as-is" state (not local component state).
function ReviewRow({ cow }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['cow-analyses', cow.cowsId],
    queryFn: () => cowsApi.analyses(cow.cowsId),
  });
  // Analyses come back newest-first, and cow.latestAnalysisStatus (from the
  // cows list) is by definition that same newest record's status - so once
  // it's "completed", [0] here is guaranteed to be that exact analysis.
  const latest = data?.bcsAnalyses?.[0];
  const meanScore = latest?.bcsScore?.mean_bcs_score ?? null;

  const [editing, setEditing] = useState(false);
  const [tempScore, setTempScore] = useState(0);
  const [overriddenScore, setOverriddenScore] = useState(null);

  const approveMutation = useMutation({
    mutationFn: () => bcsAnalysisApi.approve(latest.id),
    onSuccess: () => {
      setOverriddenScore(null);
      queryClient.invalidateQueries({ queryKey: ['cow-analyses', cow.cowsId] });
    },
  });

  if (!latest) return null;
  // Overriding is a newer, local-only decision than whatever is_approved
  // says on the record - if the user just picked a different value, that
  // takes visual priority over a possibly-stale "approved" from the server.
  const isApproved = latest.is_approved && overriddenScore == null;
  const displayedScore = overriddenScore ?? meanScore;

  function goToCow() {
    navigate(`/herd/${cow.cowsId}`);
  }

  function startOverride() {
    setTempScore(meanScore ?? 3);
    setEditing(true);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: 16 }}>
      {latest.imageUrls?.[0] && (
        <img
          src={latest.imageUrls[0]} alt="" onClick={goToCow}
          style={{ width: 58, height: 58, borderRadius: 8, objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={goToCow}>
        <div style={{ fontSize: '14.5px', fontWeight: 700 }}>Cow {cow.cowsId}</div>
        <div style={{ fontSize: '12.5px', color: '#82796a' }}>Last analyzed {fmtDate(latest.createdAt)}</div>
        {isApproved && (
          <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 600 }}>Approved as-is</div>
        )}
        {!isApproved && overriddenScore != null && (
          <div style={{ fontSize: '11.5px', color: '#b45309', fontWeight: 600 }}>Overridden from {formatScore(meanScore)}</div>
        )}
        {approveMutation.isError && (
          <div style={{ fontSize: '11.5px', color: '#b91c1c', fontWeight: 600 }}>Approve failed - try again.</div>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setTempScore((s) => Math.max(1, roundQuarter(s - 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>&minus;</button>
          <div style={{ fontSize: 18, fontWeight: 800, minWidth: 44, textAlign: 'center' }}>{formatScore(tempScore)}</div>
          <button onClick={() => setTempScore((s) => Math.min(5, roundQuarter(s + 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>+</button>
          <button onClick={() => { setOverriddenScore(tempScore); setEditing(false); }} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer' }}>Confirm</button>
          <button onClick={() => setEditing(false)} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Badge score={displayedScore} />
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            style={{
              padding: '8px 14px', borderRadius: 7, border: '1px solid #166534', cursor: 'pointer', fontWeight: 700,
              background: isApproved ? '#166534' : '#fff', color: isApproved ? '#fff' : '#166534',
            }}
          >
            {isApproved ? 'Approved' : approveMutation.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            onClick={startOverride}
            style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}
          >
            Override
          </button>
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  const { data } = useQuery({ queryKey: ['cows'], queryFn: () => cowsApi.list() });
  const cows = (data?.cows || []).filter((cow) => cow.latestAnalysisStatus === 'completed');

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Review</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>
        Each cow's most recently completed analysis, with its mean BCS score across every model that answered.
      </p>

      {cows.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c2', borderRadius: 12, padding: 40, textAlign: 'center', color: '#82796a' }}>
          No completed analyses to review yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cows.map((cow) => <ReviewRow key={cow.cowsId} cow={cow} />)}
      </div>
    </div>
  );
}
