import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cowsApi } from '../api/cows.js';
import Badge from '../components/Badge.jsx';
import ConfidencePill from '../components/ConfidencePill.jsx';
import Thumbnail from '../components/Thumbnail.jsx';
import { bandFor, formatScore } from '../domain/bcs.js';

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CowDetailPage() {
  const { cowId } = useParams();
  const navigate = useNavigate();

  const { data: cowData } = useQuery({ queryKey: ['cow', cowId], queryFn: () => cowsApi.get(cowId) });
  const { data: readingsData } = useQuery({ queryKey: ['cow-readings', cowId], queryFn: () => cowsApi.readings(cowId) });

  const cow = cowData?.cow;
  const readings = readingsData?.readings || [];
  const readingsAsc = [...readings].reverse().filter((r) => r.score != null);
  const n = readingsAsc.length;
  const chartPoints = readingsAsc.map((r, i) => ({
    x: n === 1 ? 335 : 60 + (i / (n - 1)) * 550,
    y: 230 - (r.score - 1) * 52.5,
    color: bandFor(r.score).color,
  }));
  const trendPoints = chartPoints.map((p) => `${p.x},${p.y}`).join(' ');

  if (!cow) return <div style={{ padding: 28 }}>Loading&hellip;</div>;

  return (
    <div style={{ padding: '28px 28px 60px' }}>
      <div onClick={() => navigate('/herd')} style={{ cursor: 'pointer', color: '#166534', fontWeight: 600, marginBottom: 18 }}>&#8592; Back to herd</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>Cow {cow.cowId}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: '12.5px', background: '#efece1', padding: '5px 11px', borderRadius: 999 }}>{cow.breed}</span>
            <span style={{ fontSize: '12.5px', background: '#efece1', padding: '5px 11px', borderRadius: 999 }}>{cow.lactation} lactation</span>
            <span style={{ fontSize: '12.5px', background: '#efece1', padding: '5px 11px', borderRadius: 999 }}>{cow.pen}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#82796a' }}>Current BCS</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: bandFor(cow.latestScore).color }}>{formatScore(cow.latestScore)}</div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: 20, marginBottom: 26 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>BCS Trend</div>
        <svg viewBox="0 0 640 270" style={{ width: '100%', height: 'auto' }}>
          <rect x="50" y="151.25" width="570" height="78.75" fill="#fbeedd" />
          <rect x="50" y="85.625" width="570" height="65.625" fill="#e6f2e8" />
          <rect x="50" y="20" width="570" height="65.625" fill="#e8edfc" />
          <polyline points={trendPoints} fill="none" stroke="#1c2a20" strokeWidth="2.5" />
          {chartPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={5.5} fill={p.color} stroke="#fff" strokeWidth={1.5} />)}
        </svg>
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Reading History</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {readings.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 14px' }}>
            <Thumbnail readingId={r.id} size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{fmtDate(r.capturedAt)}</div>
              <div style={{ fontSize: 12, color: '#82796a' }}>{r.flagged ? `Flagged — ${r.confidence} confidence` : 'Confirmed'}</div>
            </div>
            <ConfidencePill confidence={r.confidence} />
            <Badge score={r.score} />
          </div>
        ))}
      </div>
    </div>
  );
}
