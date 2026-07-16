import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cowsApi } from '../api/cows.js';
import Badge from '../components/Badge.jsx';
import { bandFor } from '../domain/bcs.js';

const FILTERS = [
  { key: 'all', label: 'All' }, { key: 'flagged', label: 'Flagged' },
  { key: 'thin', label: 'Too thin' }, { key: 'ideal', label: 'Ideal' }, { key: 'heavy', label: 'Too heavy' },
];

export default function HerdPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');

  const { data } = useQuery({
    queryKey: ['cows', { search, filter, sort }],
    queryFn: () => cowsApi.list({ search: search || undefined, filter: filter === 'all' ? undefined : filter, sort }),
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
          style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #d8d2c2', width: 160 }}
        />
        {FILTERS.map((f) => (
          <div
            key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: '1px solid #d8d2c2', background: filter === f.key ? '#1c2a20' : '#fff',
              color: filter === f.key ? '#fff' : '#20241f',
            }}
          >
            {f.label}
          </div>
        ))}
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ marginLeft: 'auto', padding: '9px 12px', borderRadius: 8, border: '1px solid #d8d2c2' }}>
          <option value="recent">Sort: Most recently scored</option>
          <option value="bcs-asc">Sort: BCS low to high</option>
          <option value="bcs-desc">Sort: BCS high to low</option>
          <option value="flagged">Sort: Flagged first</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 16 }}>
        {cows.map((cow) => (
          <div
            key={cow.cowId} onClick={() => navigate(`/herd/${cow.cowId}`)}
            style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}
          >
            <div style={{ height: 92, background: 'linear-gradient(135deg,#7c9b85,#4f6b57)' }} />
            <div style={{ padding: '12px 14px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Cow {cow.cowId}</div>
                <Badge score={cow.latestScore} />
              </div>
              <div style={{ fontSize: 12, color: '#82796a', marginTop: 4 }}>{bandFor(cow.latestScore).label} &middot; {cow.pen}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
