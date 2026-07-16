import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewApi } from '../api/review.js';
import Thumbnail from '../components/Thumbnail.jsx';
import ConfidencePill from '../components/ConfidencePill.jsx';
import Badge from '../components/Badge.jsx';
import { formatScore } from '../domain/bcs.js';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ['review-queue'], queryFn: reviewApi.queue });
  const [editingId, setEditingId] = useState(null);
  const [tempScore, setTempScore] = useState(0);

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['review-queue'] });
  }

  async function approve(id) {
    await reviewApi.approve(id);
    refetch();
  }
  async function confirmOverride(id) {
    await reviewApi.override(id, tempScore);
    setEditingId(null);
    refetch();
  }

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Review Queue</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Readings needing a quick human check.</p>

      {items.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c2', borderRadius: 12, padding: 40, textAlign: 'center', color: '#82796a' }}>
          Queue is clear &mdash; nothing needs review right now.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => {
          const editing = editingId === item.id;
          return (
            <div key={item.id} style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
              <Thumbnail readingId={item.id} size={58} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14.5px', fontWeight: 700 }}>Cow {item.cowId}</div>
                <div style={{ fontSize: '12.5px', color: '#82796a' }}>{fmtDate(item.capturedAt)}</div>
                <div style={{ fontSize: '12.5px', color: '#b45309', fontWeight: 600 }}>{item.flagReason}</div>
              </div>
              <ConfidencePill confidence={item.confidence} />
              {editing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setTempScore((s) => Math.max(1, roundQuarter(s - 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>&minus;</button>
                  <div style={{ fontSize: 18, fontWeight: 800, minWidth: 44, textAlign: 'center' }}>{formatScore(tempScore)}</div>
                  <button onClick={() => setTempScore((s) => Math.min(5, roundQuarter(s + 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>+</button>
                  <button onClick={() => confirmOverride(item.id)} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer' }}>Confirm</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Badge score={item.score} />
                  <button onClick={() => approve(item.id)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid #166534', background: '#fff', color: '#166534', fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                  <button onClick={() => { setEditingId(item.id); setTempScore(item.score); }} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Override</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
