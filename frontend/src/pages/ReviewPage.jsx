import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cowsApi } from '../api/cows.js';
import { bcsAnalysisApi } from '../api/bcsAnalysis.js';
import Badge from '../components/Badge.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { formatScore } from '../domain/bcs.js';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

const CANDIDATES = [
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'mean', label: 'Mean' },
  { key: 'median', label: 'Median' },
];

// meanScore/medianScore come pre-computed from the backend (same math,
// computed fresh on every read - see bcsScoring.js) - no need to recompute
// them here, just read them alongside the per-provider raw scores.
function candidateValue(analysis, key) {
  if (key === 'mean') return analysis.meanScore;
  if (key === 'median') return analysis.medianScore;
  const assessment = analysis.bcsScore?.[key];
  return assessment?.status === 'success' ? assessment.final_bcs : null;
}

// A toggle chip, not a raw checkbox - `checked` reflects whether this
// candidate's value exactly matches whatever's currently clicked (see
// ReviewRow), not whether *this specific* chip was the one clicked. That's
// what makes several chips light up from a single click when their values
// coincide.
function CandidateChip({ label, value, checked, disabled, onClick, style }) {
  const available = value != null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available || disabled}
      aria-pressed={checked}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
        fontSize: 12.5, fontWeight: 600, border: checked ? '1.5px solid #166534' : '1px solid #d8d2c2',
        background: checked ? '#e6f2e8' : '#fff',
        color: available ? (checked ? '#166534' : '#3a3324') : '#b7b0a0',
        cursor: available && !disabled ? 'pointer' : 'not-allowed',
        opacity: disabled && available ? 0.6 : 1,
        ...style,
      }}
    >
      <span style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: checked ? 'none' : '1.5px solid #c9c2ae', background: checked ? '#166534' : 'transparent',
      }}>
        {checked && <Check size={11} color="#fff" strokeWidth={3} />}
      </span>
      {label}: {available ? formatScore(value) : 'No score'}
    </button>
  );
}

// Approve no longer exists as a separate action - clicking Median (which
// auto-matches any provider that happens to agree with it) and hitting Save
// is a strict superset of what it used to do. Selecting a candidate
// (PATCH .../select) and Overriding (PATCH .../override) both set
// is_approved on the record - each is itself a final review decision, so
// both persist and drop this row off the review list once the cows list
// reflects it.
function ReviewRow({ cow }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data } = useQuery({
    queryKey: ['cow-analyses', cow.cowsId],
    queryFn: () => cowsApi.analyses(cow.cowsId),
  });
  // Analyses come back newest-first, and cow.latestAnalysisStatus (from the
  // cows list) is by definition that same newest record's status - so once
  // it's "completed", [0] here is guaranteed to be that exact analysis.
  const latest = data?.bcsAnalyses?.[0];

  // Which candidate the reviewer clicked - null until they pick one. Not
  // saved anywhere until Save is pressed; the backend does the real
  // matching (and is the source of truth for what actually gets persisted),
  // this is purely a client-side preview of what Save would do.
  const [selectedSource, setSelectedSource] = useState(null);
  const [editing, setEditing] = useState(false);
  const [tempScore, setTempScore] = useState(0);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['cow-analyses', cow.cowsId] });
    queryClient.invalidateQueries({ queryKey: ['cows'] });
  }

  const selectMutation = useMutation({
    mutationFn: (source) => bcsAnalysisApi.selectScore(latest.id, source),
    onSuccess: () => { invalidateAll(); showToast('Review submitted successfully.'); },
    onError: () => showToast('Failed to submit - please try again.', { type: 'error' }),
  });

  const overrideMutation = useMutation({
    mutationFn: (score) => bcsAnalysisApi.override(latest.id, score),
    onSuccess: () => { invalidateAll(); showToast('Override saved successfully.'); },
    onError: () => showToast('Failed to save override - please try again.', { type: 'error' }),
  });

  // A row shouldn't render its controls once reviewed - it's about to drop
  // off the list on the next refetch anyway, but this guards against it
  // still being visible mid-transition instead of relying solely on that.
  if (!latest || latest.is_approved) return null;

  const anyActionPending = selectMutation.isPending || overrideMutation.isPending;
  const candidates = CANDIDATES.map((c) => ({ ...c, value: candidateValue(latest, c.key) }));
  const clickedValue = selectedSource != null ? candidates.find((c) => c.key === selectedSource)?.value : null;
  const previewScore = clickedValue ?? latest.medianScore;

  function toggleCandidate(key) {
    setSelectedSource((prev) => (prev === key ? null : key));
  }

  function startOverride() {
    setTempScore(previewScore ?? 3);
    setEditing(true);
  }

  function confirmOverride() {
    setEditing(false);
    overrideMutation.mutate(tempScore);
  }

  function goToCow() {
    navigate(`/herd/${cow.cowsId}`);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: 16 }}>
      {latest.imageUrls?.[0] && (
        <img
          src={latest.imageUrls[0]} alt="" onClick={goToCow}
          style={{ width: 58, height: 58, borderRadius: 8, objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ cursor: 'pointer' }} onClick={goToCow}>
          <div style={{ fontSize: '14.5px', fontWeight: 700 }}>Cow {cow.cowsId}</div>
          <div style={{ fontSize: '12.5px', color: '#82796a' }}>Last analyzed {fmtDate(latest.createdAt)}</div>
          {selectMutation.isError && (
            <div style={{ fontSize: '11.5px', color: '#b91c1c', fontWeight: 600 }}>Failed to submit - try again.</div>
          )}
          {overrideMutation.isError && (
            <div style={{ fontSize: '11.5px', color: '#b91c1c', fontWeight: 600 }}>Override failed - try again.</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {candidates.map((c, i) => (
            <CandidateChip
              key={c.key}
              label={c.label}
              value={c.value}
              checked={c.value != null && clickedValue != null && c.value === clickedValue}
              disabled={anyActionPending || editing}
              onClick={() => toggleCandidate(c.key)}
              style={i === 3 ? { marginLeft: 48 } : undefined}
            />
          ))}
        </div>
      </div>

      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setTempScore((s) => Math.max(1, roundQuarter(s - 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>&minus;</button>
          <div style={{ fontSize: 18, fontWeight: 800, minWidth: 44, textAlign: 'center' }}>{formatScore(tempScore)}</div>
          <button onClick={() => setTempScore((s) => Math.min(5, roundQuarter(s + 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>+</button>
          <button onClick={confirmOverride} disabled={overrideMutation.isPending} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer' }}>
            {overrideMutation.isPending ? 'Saving…' : 'Confirm'}
          </button>
          <button onClick={() => setEditing(false)} disabled={overrideMutation.isPending} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Badge score={previewScore} />
          <button
            onClick={() => selectMutation.mutate(selectedSource)}
            disabled={anyActionPending || selectedSource == null}
            style={{
              padding: '8px 14px', borderRadius: 7, border: 'none', cursor: selectedSource == null ? 'default' : 'pointer', fontWeight: 700,
              background: selectedSource == null ? '#efece1' : '#166534', color: selectedSource == null ? '#a39c86' : '#fff',
            }}
          >
            {selectMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={startOverride}
            disabled={anyActionPending}
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
  // Once approved, a cow drops off this list entirely - only completed,
  // not-yet-approved analyses need a reviewer's attention.
  const cows = (data?.cows || []).filter(
    (cow) => cow.latestAnalysisStatus === 'completed' && !cow.latestAnalysisIsApproved
  );

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Review</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>
        Completed analyses waiting for a reviewer - click any combination of models, mean, or median that
        looks right (matching ones highlight together automatically), then Save. Or Override with your own value.
      </p>

      {cows.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c2', borderRadius: 12, padding: 40, textAlign: 'center', color: '#82796a' }}>
          Nothing waiting for review right now.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cows.map((cow) => <ReviewRow key={cow.cowsId} cow={cow} />)}
      </div>
    </div>
  );
}
