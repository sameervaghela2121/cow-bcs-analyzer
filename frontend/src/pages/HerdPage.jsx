import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cowsApi } from '../api/cows.js';
import { PENDING_STATUSES } from '../domain/analysisStatus.js';
import { formatScore, bandFor } from '../domain/bcs.js';
import Skeleton from '../components/Skeleton.jsx';
import { Button, PageHeader, StatusChip, TextInput } from '../components/ui/index.js';
import { color, radius, shadow, transition } from '../styles/tokens.js';

const PAGE_SIZE = 10;

const cardShellStyle = {
  background: color.bgCard,
  border: `1px solid ${color.borderCard}`,
  borderRadius: radius.card,
  boxShadow: shadow.card,
  overflow: 'hidden',
  cursor: 'pointer',
  transition,
};

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
        <div style={{ height: 240, background: `linear-gradient(135deg, ${color.primarySoft}, #C8E6C9)` }} />
      )}
      <div style={{ position: 'absolute', top: 12, left: 12 }}>
        <StatusChip tone={active ? 'success' : 'neutral'} label={active ? 'Active' : 'Inactive'} dot style={{ background: active ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.9)', fontWeight: 700 }} />
      </div>
    </div>
  );
}

// Matches CowCardThumbnail + the card's text rows below it, so the loading
// state doesn't jump around once the real cards swap in.
function SkeletonCowCard() {
  return (
    <div style={cardShellStyle}>
      <Skeleton height={240} radius={0} />
      <div style={{ padding: '16px 18px' }}>
        <Skeleton width="60%" height={19} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <Skeleton width={70} height={13} />
          <Skeleton width={40} height={13} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
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
    <div style={{ padding: '32px 32px 60px' }}>
      <PageHeader
        title="Herd"
        subtitle={
          isLoading ? (
            <Skeleton width={140} height={13} style={{ marginTop: 2 }} />
          ) : (
            `${cows.length} of ${total} cows shown`
          )
        }
        actions={
          <Button onClick={() => navigate('/upload')} icon={Plus}>
            Measure BCS
          </Button>
        }
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        <TextInput
          pill
          placeholder="Search cow ID…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{ width: 260 }}
        />
      </div>

      <div className="bcs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 24 }}>
        {isLoading && Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCowCard key={i} />)}
        {!isLoading && cows.map((cow) => (
          <div
            key={cow.cowsId}
            onClick={() => navigate(`/herd/${cow.cowsId}`)}
            style={cardShellStyle}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = shadow.raised; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = shadow.card; e.currentTarget.style.transform = 'none'; }}
          >
            <CowCardThumbnail
              thumbnailUrl={cow.latestAnalysisThumbnailUrl}
              imageUrl={cow.latestAnalysisImageUrl}
              isActive={cow.isActive}
            />
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: color.textPrimary }}>Cow {cow.cowsId}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <div style={{ fontSize: 13.5, color: color.textSecondary }}>Last BCS</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: cow.latestBcsScore != null ? bandFor(cow.latestBcsScore).color : color.textMuted }}>
                  {cow.latestBcsScore != null ? formatScore(cow.latestBcsScore) : '—'}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <div style={{ fontSize: 13.5, color: color.textSecondary }}>Last BCS At</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: color.textPrimary }}>
                  {cow.latestAnalysisAt ? fmtDate(cow.latestAnalysisAt) : '—'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 36 }}>
          <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => goToPage(page - 1)} disabled={page <= 1}>
            Previous
          </Button>
          <span style={{ fontSize: 13, color: color.textSecondary, fontWeight: 500 }}>Page {page} of {totalPages}</span>
          <Button variant="secondary" size="sm" iconRight={ChevronRight} onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
