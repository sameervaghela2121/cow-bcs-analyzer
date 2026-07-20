import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

const PROVIDERS = [
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'openai', label: 'OpenAI' },
];

function ProviderCheckbox({ label, assessment, selected, disabled, onSelect }) {
  const available = assessment?.status === 'success' && assessment?.final_bcs != null;
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5,
        color: available ? '#3a3324' : '#b7b0a0', cursor: available && !disabled ? 'pointer' : 'not-allowed',
      }}
    >
      <input type="checkbox" checked={!!selected} disabled={!available || disabled} onChange={onSelect} />
      {label}: {available ? `${formatScore(assessment.final_bcs)}${assessment.confidence ? ` (${assessment.confidence})` : ''}` : 'No score'}
    </label>
  );
}

// Approve (.../approve), checkbox selection (.../select), and Override
// (.../override) all set is_approved on the record - each is itself a
// review decision, just as final as any other - so all three persist the
// record and drop this row off the review list once the cows list reflects it.
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
  const medianScore = latest?.bcsScore?.median_bcs_score?.score ?? null;
  // Exactly one of median/claude/gemini/openai is ever is_selected on the
  // record itself - reflect whichever the backend currently says is picked.
  const selectedProvider = PROVIDERS.find((p) => latest?.bcsScore?.[p.key]?.is_selected)?.key ?? null;
  const selectedProviderScore = selectedProvider ? latest?.bcsScore?.[selectedProvider]?.final_bcs ?? null : null;

  const [editing, setEditing] = useState(false);
  const [tempScore, setTempScore] = useState(0);
  const [overriddenScore, setOverriddenScore] = useState(null);
  // Checking a provider's box doesn't save immediately - it just stages a
  // choice ("Select Gemini's score (3.5) as final?") that still needs an
  // explicit Confirm, same idea as the Override stepper below.
  const [pendingProvider, setPendingProvider] = useState(null);
  // Captured at the moment Override is opened - medianScore itself becomes
  // the *new* value once the mutation's invalidation refetch lands, so
  // reading it live afterward for "Overridden from X" would show the new
  // value twice instead of the value being replaced.
  const [preOverrideScore, setPreOverrideScore] = useState(null);

  // All three mutations end up changing whether this cow still belongs in
  // the review list (latestAnalysisIsApproved, on the cows list), not just
  // this row's own analysis detail - both queries need refreshing either way.
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['cow-analyses', cow.cowsId] });
    queryClient.invalidateQueries({ queryKey: ['cows'] });
  }

  const approveMutation = useMutation({
    mutationFn: () => bcsAnalysisApi.approve(latest.id),
    onSuccess: () => {
      setOverriddenScore(null);
      invalidateAll();
      showToast('Approved successfully.');
    },
    onError: () => showToast('Failed to approve - please try again.', { type: 'error' }),
  });

  const selectMutation = useMutation({
    mutationFn: (provider) => bcsAnalysisApi.selectProvider(latest.id, provider),
    onSuccess: () => {
      setOverriddenScore(null);
      invalidateAll();
      showToast('Selection saved successfully.');
    },
    onError: () => showToast('Failed to save selection - please try again.', { type: 'error' }),
    onSettled: () => setPendingProvider(null),
  });

  const overrideMutation = useMutation({
    mutationFn: (score) => bcsAnalysisApi.override(latest.id, score),
    onSuccess: () => {
      invalidateAll();
      showToast('Override saved successfully.');
    },
    onError: () => showToast('Failed to save override - please try again.', { type: 'error' }),
  });

  if (!latest) return null;
  // Overriding is a newer decision than whatever is_approved says on the
  // record - if the user just picked a different value, that takes visual
  // priority over a possibly-stale "approved" from before the override.
  const isApproved = latest.is_approved && overriddenScore == null;
  const displayedScore = overriddenScore ?? (selectedProvider ? selectedProviderScore : medianScore);
  const anyActionPending = approveMutation.isPending || selectMutation.isPending || overrideMutation.isPending;

  function goToCow() {
    navigate(`/herd/${cow.cowsId}`);
  }

  function startOverride() {
    setPreOverrideScore(displayedScore);
    setTempScore(displayedScore ?? 3);
    setEditing(true);
  }

  function confirmOverride() {
    setOverriddenScore(tempScore);
    setEditing(false);
    overrideMutation.mutate(tempScore);
  }

  function confirmSelect() {
    selectMutation.mutate(pendingProvider);
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
          {isApproved && (
            <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 600 }}>
              {selectedProvider
                ? `Approved: ${PROVIDERS.find((p) => p.key === selectedProvider).label} selected`
                : 'Approved as-is (median)'}
            </div>
          )}
          {!isApproved && overriddenScore != null && (
            <div style={{ fontSize: '11.5px', color: '#b45309', fontWeight: 600 }}>Overridden from {formatScore(preOverrideScore)}</div>
          )}
          {approveMutation.isError && (
            <div style={{ fontSize: '11.5px', color: '#b91c1c', fontWeight: 600 }}>Approve failed - try again.</div>
          )}
          {selectMutation.isError && (
            <div style={{ fontSize: '11.5px', color: '#b91c1c', fontWeight: 600 }}>Selection failed - try again.</div>
          )}
          {overrideMutation.isError && (
            <div style={{ fontSize: '11.5px', color: '#b91c1c', fontWeight: 600 }}>Override failed - try again.</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          {PROVIDERS.map((p) => (
            <ProviderCheckbox
              key={p.key}
              label={p.label}
              assessment={latest.bcsScore?.[p.key]}
              selected={selectedProvider === p.key || pendingProvider === p.key}
              disabled={anyActionPending || editing || pendingProvider != null}
              onSelect={() => setPendingProvider(p.key)}
            />
          ))}
        </div>
      </div>

      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setTempScore((s) => Math.max(1, roundQuarter(s - 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>&minus;</button>
          <div style={{ fontSize: 18, fontWeight: 800, minWidth: 44, textAlign: 'center' }}>{formatScore(tempScore)}</div>
          <button onClick={() => setTempScore((s) => Math.min(5, roundQuarter(s + 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>+</button>
          <button onClick={confirmOverride} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer' }}>Confirm</button>
          <button onClick={() => setEditing(false)} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : pendingProvider ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: '#3a3324' }}>
            Select {PROVIDERS.find((p) => p.key === pendingProvider).label}&apos;s score (
            {formatScore(latest.bcsScore?.[pendingProvider]?.final_bcs)}) as final?
          </span>
          <button
            onClick={confirmSelect}
            disabled={selectMutation.isPending}
            style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer' }}
          >
            {selectMutation.isPending ? 'Saving…' : 'Confirm'}
          </button>
          <button
            onClick={() => setPendingProvider(null)}
            disabled={selectMutation.isPending}
            style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Badge score={displayedScore} />
          <button
            onClick={() => approveMutation.mutate()}
            disabled={anyActionPending}
            style={{
              padding: '8px 14px', borderRadius: 7, border: '1px solid #166534', cursor: 'pointer', fontWeight: 700,
              background: isApproved && !selectedProvider ? '#166534' : '#fff', color: isApproved && !selectedProvider ? '#fff' : '#166534',
            }}
          >
            {isApproved && !selectedProvider ? 'Approved' : approveMutation.isPending ? 'Approving…' : 'Approve'}
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
        Completed analyses waiting for a reviewer - approve the median, check a model's score to select it instead, or override with a custom value, and it drops off this list.
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
