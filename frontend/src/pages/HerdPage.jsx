import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cowsApi } from '../api/cows.js';
import { PENDING_STATUSES } from '../domain/analysisStatus.js';

const PAGE_SIZE = 10;

// Cover photo for a herd card: the latest analysis's compressed 300X300
// thumbnail, falling back to the original if that variant 404s (compression
// still pending). Cows with no uploads yet keep the plain gradient block.
function CowCardThumbnail({ thumbnailUrl, imageUrl }) {
  const [failed, setFailed] = useState(false);
  const src = !failed && thumbnailUrl ? thumbnailUrl : imageUrl;
  if (!src) {
    return <div style={{ height: 92, background: 'linear-gradient(135deg,#7c9b85,#4f6b57)' }} />;
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      style={{ height: 92, width: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

export default function HerdPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');

  // Page lives in the URL (?page=2) rather than component state, so
  // following a cow into its detail page and hitting "back" lands you on
  // the same page instead of resetting to page 1.
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  function goToPage(p) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (p <= 1) next.delete('page');
      else next.set('page', String(p));
      return next;
    });
  }

  function handleSearchChange(value) {
    setSearch(value);
    goToPage(1); // a new search term invalidates whatever page we were on
  }

  const { data } = useQuery({
    queryKey: ['cows', { search, page }],
    queryFn: () => cowsApi.list({ search: search || undefined, page, limit: PAGE_SIZE }),
    // Keep the grid's status pills current while anything is still
    // processing, same 10s cadence as the cow detail page; stop polling
    // once every cow's latest analysis has settled.
    refetchInterval: (query) =>
      (query.state.data?.cows || []).some((cow) => PENDING_STATUSES.has(cow.latestAnalysisStatus)) ? 10000 : false,
  });

  const cows = data?.cows || [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Herd Overview</h1>
        <div style={{ fontSize: 13, color: '#82796a' }}>{cows.length} of {total} cows shown</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
        <input
          placeholder="Search cow ID…" value={search} onChange={(e) => handleSearchChange(e.target.value)}
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
              <CowCardThumbnail thumbnailUrl={cow.latestAnalysisThumbnailUrl} imageUrl={cow.latestAnalysisImageUrl} />
              <div style={{ padding: '12px 14px 14px' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Cow {cow.cowsId}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 32 }}>
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff',
              cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1, fontSize: 13, fontWeight: 600,
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: '#82796a' }}>Page {page} of {totalPages}</span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff',
              cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1, fontSize: 13, fontWeight: 600,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
