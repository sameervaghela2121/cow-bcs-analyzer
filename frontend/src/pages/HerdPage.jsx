import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cowsApi } from '../api/cows.js';
import { PENDING_STATUSES } from '../domain/analysisStatus.js';
import { formatScore, bandFor } from '../domain/bcs.js';
import Skeleton from '../components/Skeleton.jsx';

const PAGE_SIZE = 10;

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Cover photo for a herd card: the latest analysis's compressed 300X300
// thumbnail, falling back to the original if that variant 404s (compression
// still pending). Cows with no uploads yet keep the plain gradient block.
// isActive is undefined in a few test fixtures that don't set it - treated
// as active (the Cow schema's own default) rather than flagged Inactive.
function CowCardThumbnail({ thumbnailUrl, imageUrl, isActive }) {
  const [failed, setFailed] = useState(false);
  const src = !failed && thumbnailUrl ? thumbnailUrl : imageUrl;
  const active = isActive !== false;
  return (
    <div style={{ position: 'relative' }}>
      {src ? (
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          style={{ height: 240, width: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ height: 240, background: 'linear-gradient(135deg,#7c9b85,#4f6b57)' }} />
      )}
      <div
        style={{
          position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: '5px 11px',
          background: active ? 'rgba(230,242,232,0.95)' : 'rgba(239,236,225,0.95)',
          color: active ? '#166534' : '#82796a',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#166534' : '#a39c86' }} />
        {active ? 'Active' : 'Inactive'}
      </div>
    </div>
  );
}

// Matches CowCardThumbnail + the card's text rows below it, so the loading
// state doesn't jump around once the real cards swap in.
function SkeletonCowCard() {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, overflow: 'hidden' }}>
      <Skeleton height={240} radius={0} />
      <div style={{ padding: '14px 18px 14px' }}>
        <Skeleton width="60%" height={19} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <Skeleton width={70} height={13} />
          <Skeleton width={40} height={13} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9 }}>
          <Skeleton width={90} height={13} />
          <Skeleton width={70} height={13} />
        </div>
      </div>
    </div>
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

  const { data, isLoading } = useQuery({
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Herd Overview</h1>
          {isLoading ? (
            <Skeleton width={110} height={13} style={{ marginTop: 6 }} />
          ) : (
            <div style={{ fontSize: 13, color: '#82796a', marginTop: 4 }}>{cows.length} of {total} cows shown</div>
          )}
        </div>
        <button
          onClick={() => navigate('/upload')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <Plus size={16} /> Measure BCS
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
        <input
          placeholder="Search cow ID…" value={search} onChange={(e) => handleSearchChange(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #d8d2c2', width: 220 }}
        />
      </div>

      <div className="bcs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 22 }}>
        {isLoading && Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCowCard key={i} />)}
        {!isLoading && cows.map((cow) => (
          <div key={cow.cowsId}>
            <div
              onClick={() => navigate(`/herd/${cow.cowsId}`)}
              style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, overflow: 'hidden', cursor: 'pointer' }}
            >
              <CowCardThumbnail
                thumbnailUrl={cow.latestAnalysisThumbnailUrl}
                imageUrl={cow.latestAnalysisImageUrl}
                isActive={cow.isActive}
              />
              <div style={{ padding: '14px 18px 14px' }}>
                <div style={{ fontSize: 19, fontWeight: 700 }}>Cow {cow.cowsId}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <div style={{ fontSize: 13.5, color: '#82796a' }}>Last BCS</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: cow.latestBcsScore != null ? bandFor(cow.latestBcsScore).color : '#b7b0a0' }}>
                    {cow.latestBcsScore != null ? formatScore(cow.latestBcsScore) : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                  <div style={{ fontSize: 13.5, color: '#82796a' }}>Last BCS At</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#3c372c' }}>
                    {cow.latestAnalysisAt ? fmtDate(cow.latestAnalysisAt) : '—'}
                  </div>
                </div>
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
