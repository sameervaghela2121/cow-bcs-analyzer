import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cowsApi } from '../api/cows.js';
import StatusPill from '../components/StatusPill.jsx';

export default function HerdPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['cows', { search }],
    queryFn: () => cowsApi.list({ search: search || undefined }),
  });

  const cows = data?.cows || [];

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Herd Overview</h1>
        <div style={{ fontSize: 13, color: '#82796a' }}>{cows.length} of {data?.total ?? 0} cows shown</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
        <input
          placeholder="Search cow ID…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #d8d2c2', width: 220 }}
        />
      </div>

      <div className="bcs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 16 }}>
        {cows.map((cow) => (
          <div key={cow.cowsId}>
            <div
              onClick={() => navigate(`/herd/${cow.cowsId}`)}
              style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}
            >
              <div style={{ height: 92, background: 'linear-gradient(135deg,#7c9b85,#4f6b57)' }} />
              <div style={{ padding: '12px 14px 14px' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Cow {cow.cowsId}</div>
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
              {cow.latestAnalysisStatus ? (
                <StatusPill status={cow.latestAnalysisStatus} />
              ) : (
                <span style={{ fontSize: 11.5, color: '#a39c86' }}>No uploads yet</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
