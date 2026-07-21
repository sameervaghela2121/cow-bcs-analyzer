import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, ClipboardList, Plus, X } from 'lucide-react';
import { cowsApi } from '../api/cows.js';
import { usePollBcsAnalysis } from '../hooks/usePollBcsAnalysis.js';
import { statusLabel, statusColor, PENDING_STATUSES } from '../domain/analysisStatus.js';
import { formatScore, bandFor, PROVIDERS, PROVIDER_LABELS } from '../domain/bcs.js';
import Skeleton from '../components/Skeleton.jsx';

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Same date, plus the time of day in IST (12-hour, with AM/PM) - so same-day
// uploads can be told apart by which one actually happened first, regardless
// of the viewer's own timezone.
function fmtDateTimeIST(iso) {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  return `${datePart}, ${timePart} IST`;
}

// Full-screen viewer for one analysis's photos. Wraps around at both ends
// so left/right always does something instead of going dead at the first
// or last photo. `images` is the compressed "display" variant (fast to
// load); `fallbackImages` is the original, used per-photo if that variant
// 404s (compression still pending, or a record from before this feature).
function Lightbox({ images, fallbackImages, index, onClose, onNavigate }) {
  const [failedIndices, setFailedIndices] = useState(() => new Set());
  const [loadedIndices, setLoadedIndices] = useState(() => new Set());

  // Warm the browser's cache for every photo in this record as soon as the
  // viewer opens, not just the one on screen - so by the time someone clicks
  // next/prev, that image is (in the common case) already sitting in cache
  // instead of triggering a fresh, visibly slow fetch right as they navigate.
  // `images`/`fallbackImages` keep the same array reference across a
  // next/prev click (only `index` changes - see CowDetailPage's onNavigate),
  // so this effect only re-runs when a genuinely new gallery is opened.
  useEffect(() => {
    let cancelled = false;
    const markLoaded = (i) => {
      if (cancelled) return;
      setLoadedIndices((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
    };
    images.forEach((url, i) => {
      const preload = new Image();
      preload.onload = () => markLoaded(i);
      preload.onerror = () => {
        if (cancelled) return;
        setFailedIndices((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
        const fallbackUrl = fallbackImages?.[i];
        if (fallbackUrl && fallbackUrl !== url) {
          const fallbackPreload = new Image();
          fallbackPreload.onload = () => markLoaded(i);
          fallbackPreload.src = fallbackUrl;
        }
      };
      preload.src = url;
    });
    return () => { cancelled = true; };
  }, [images, fallbackImages]);

  const src = failedIndices.has(index) ? (fallbackImages?.[index] ?? images[index]) : images[index];
  const ready = loadedIndices.has(index);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate((index - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') onNavigate((index + 1) % images.length);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [index, images.length, onClose, onNavigate]);

  const iconButtonStyle = {
    width: 46, height: 46, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.12)',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 14px rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(8,10,8,0.92)', backdropFilter: 'blur(3px)',
        zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <button onClick={onClose} aria-label="Close" style={{ ...iconButtonStyle, position: 'absolute', top: 20, right: 20 }}>
        <X size={20} />
      </button>

      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate((index - 1 + images.length) % images.length); }}
          aria-label="Previous image"
          style={{ ...iconButtonStyle, position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)' }}
        >
          <ChevronLeft size={24} />
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: 'min(82vw, 980px)', height: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {!ready && (
          <div
            aria-label="Loading image"
            style={{
              width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.25)',
              borderTopColor: '#fff', animation: 'bcs-spin 0.8s linear infinite',
            }}
          />
        )}
        {src && (
          <img
            src={src}
            alt=""
            onLoad={() => setLoadedIndices((prev) => (prev.has(index) ? prev : new Set(prev).add(index)))}
            onError={() => setFailedIndices((prev) => new Set(prev).add(index))}
            style={{
              position: 'absolute', maxWidth: '100%', maxHeight: '100%', borderRadius: 10, objectFit: 'contain',
              boxShadow: '0 12px 40px rgba(0,0,0,0.4)', opacity: ready ? 1 : 0, transition: 'opacity 0.2s ease',
            }}
          />
        )}
      </div>

      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate((index + 1) % images.length); }}
          aria-label="Next image"
          style={{ ...iconButtonStyle, position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)' }}
        >
          <ChevronRight size={24} />
        </button>
      )}

      {images.length > 1 && (
        <div
          style={{
            marginTop: 20, color: '#fff', fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,0.14)',
            borderRadius: 999, padding: '6px 16px', backdropFilter: 'blur(6px)',
          }}
        >
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

// Consecutive-run grouping, not a full re-sort: analyses arrive already
// sorted most-recent-first, so same-day records are already adjacent - this
// just splits that single list into per-day chunks without reordering.
function groupByDate(analyses) {
  const groups = [];
  let current = null;
  for (const a of analyses) {
    const key = fmtDate(a.createdAt);
    if (!current || current.key !== key) {
      current = { key, items: [] };
      groups.push(current);
    }
    current.items.push(a);
  }
  return groups;
}

// final_bcs is the reviewer's decided score once approved; before that,
// medianScore (computed fresh server-side from whichever providers
// succeeded - see backend/src/services/bcsScoring.js) is shown as a
// preview of what accepting the median outright would give.
function ScoreBadge({ score }) {
  if (score == null) return null;
  const band = bandFor(score);
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 23, fontWeight: 800, color: band.color }}>{formatScore(score)}</div>
      <div style={{ fontSize: 12, color: '#82796a' }}>{band.label}</div>
    </div>
  );
}

// A read-only chip showing one model's raw score, or "No score" if that
// provider failed/didn't run - same per-provider data ReviewPage lets a
// reviewer act on, just displayed here for reference.
function ModelScoreChip({ label, value }) {
  const available = value != null;
  return (
    <div
      style={{
        flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
        border: '1px solid #e5e0d3', background: '#faf9f5',
        color: available ? '#3a3324' : '#b7b0a0',
      }}
    >
      {label}: {available ? formatScore(value) : 'No score'}
    </div>
  );
}

// One upload batch as a card, sized to sit in a responsive grid alongside
// other cards from the same day. Self-polls every 10s while pending (via
// usePollBcsAnalysis), stops once completed/failed. Cover photo uses the
// compressed "600X600" display variant rather than the 300X300 thumbnail -
// at this card size the 300X300 would be upscaled (worse on Retina, which
// needs 2x the pixels for a sharp render) - falling back to the original if
// it 404s. The opened gallery uses the same 600X600 variant.
function AnalysisCard({ analysis: initial, onOpenImages }) {
  const navigate = useNavigate();
  const pending = PENDING_STATUSES.has(initial.status);
  const { analysis: polled } = usePollBcsAnalysis(pending ? initial.id : null);
  const analysis = polled || initial;
  const [coverFailed, setCoverFailed] = useState(false);

  const imageUrls = analysis.imageUrls || [];
  const hasImages = imageUrls.length > 0;
  const extra = imageUrls.length - 1;
  const coverSrc = hasImages && (!coverFailed && analysis.displayUrls?.[0] ? analysis.displayUrls[0] : imageUrls[0]);

  // The score to show is always final_bcs once a reviewer has picked one;
  // before that, medianScore (computed fresh server-side from whichever
  // providers succeeded) stands in as a live preview.
  const hasFinal = analysis.final_bcs != null;
  const displayScore = hasFinal ? analysis.final_bcs : analysis.medianScore;
  const reviewPending = analysis.status === 'completed' && !analysis.is_approved;

  function openGallery() {
    if (!hasImages) return;
    const displayUrls = analysis.displayUrls;
    onOpenImages(displayUrls?.length ? displayUrls : imageUrls, imageUrls, 0);
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, overflow: 'hidden' }}>
      <div
        onClick={openGallery}
        role={hasImages ? 'button' : undefined}
        tabIndex={hasImages ? 0 : undefined}
        aria-label={hasImages ? `View ${imageUrls.length} photo${imageUrls.length === 1 ? '' : 's'}` : undefined}
        onKeyDown={(e) => { if (hasImages && (e.key === 'Enter' || e.key === ' ')) openGallery(); }}
        style={{ position: 'relative', height: 230, background: '#f2f0e8', cursor: hasImages ? 'pointer' : 'default' }}
      >
        {coverSrc && (
          <img
            src={coverSrc}
            alt=""
            onError={() => setCoverFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        <div
          style={{
            position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.94)', color: '#3c372c', fontSize: 12.5, fontWeight: 700,
            borderRadius: 8, padding: '5px 10px',
          }}
        >
          <CalendarDays size={13} /> {fmtDateTimeIST(analysis.createdAt)}
        </div>
        {extra > 0 && (
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 13, fontWeight: 700, borderRadius: 8, padding: '3px 8px' }}>
            +{extra}
          </div>
        )}
      </div>
      <div style={{ padding: '16px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div data-testid="analysis-status" style={{ fontSize: 13.5, color: statusColor(analysis.status), fontWeight: 700 }}>
              {statusLabel(analysis.status)}
              {analysis.status === 'failed' && analysis.errorMessage ? `: ${analysis.errorMessage}` : ''}
            </div>
            {reviewPending && (
              <div
                onClick={(e) => { e.stopPropagation(); navigate('/review'); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); navigate('/review'); } }}
                title="Go to Review"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, padding: '2px 8px',
                  borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#a35a05', background: '#fdf1de',
                  cursor: 'pointer',
                }}
              >
                <Clock size={11} /> Review Pending
              </div>
            )}
            {analysis.status === 'completed' && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#5c5646' }}>
                  Mean: {analysis.meanScore != null ? formatScore(analysis.meanScore) : '—'}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#5c5646' }}>
                  Median: {analysis.medianScore != null ? formatScore(analysis.medianScore) : '—'}
                </div>
              </div>
            )}
          </div>
          {analysis.status === 'completed' && displayScore != null && (
            <div style={{ textAlign: 'right' }}>
              <ScoreBadge score={displayScore} />
              <div style={{ fontSize: 11, color: '#82796a', marginTop: 2 }}>
                {hasFinal ? 'Final score' : 'Median'}
              </div>
            </div>
          )}
        </div>

        {analysis.status === 'completed' && (
          <div style={{ display: 'flex', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0ede2' }}>
            {PROVIDERS.map((key) => {
              const assessment = analysis.bcsScore?.[key];
              const value = assessment?.status === 'success' ? assessment.final_bcs : null;
              return <ModelScoreChip key={key} label={PROVIDER_LABELS[key]} value={value} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Small icon + number + label tile used in the stats bar at the top of the
// page.
function StatCard({ icon: Icon, value, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 28px', flex: 1, minWidth: 0 }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#eef4ee', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} color="#166534" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: '#1c2a20', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{value}</div>
        <div style={{ fontSize: 12.5, color: '#82796a' }}>{label}</div>
      </div>
    </div>
  );
}

export default function CowDetailPage() {
  const { cowsId } = useParams();
  const navigate = useNavigate();
  const [lightbox, setLightbox] = useState(null); // { images, fallbackImages, index } | null

  const { data: cowData } = useQuery({ queryKey: ['cow', cowsId], queryFn: () => cowsApi.get(cowsId) });
  const { data: analysesData } = useQuery({ queryKey: ['cow-analyses', cowsId], queryFn: () => cowsApi.analyses(cowsId) });

  const cow = cowData?.cow;
  const analyses = analysesData?.bcsAnalyses || [];

  const completedCount = analyses.filter((a) => a.status === 'completed').length;
  const lastScanLabel = analyses.length > 0 ? fmtDate(analyses[0].createdAt) : '—';

  if (!cow) {
    return (
      <div style={{ padding: '28px 32px 60px' }}>
        <Skeleton width={70} height={14} style={{ marginBottom: 18 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
          <div>
            <Skeleton width={160} height={26} style={{ marginBottom: 8 }} />
            <Skeleton width={240} height={13.5} />
          </div>
          <Skeleton width={160} height={42} radius={8} />
        </div>
        <div style={{ display: 'flex', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, marginBottom: 30, padding: '18px 28px', gap: 40 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Skeleton width={44} height={44} radius={999} />
              <div>
                <Skeleton width={40} height={21} style={{ marginBottom: 6 }} />
                <Skeleton width={80} height={12.5} />
              </div>
            </div>
          ))}
        </div>
        <Skeleton width={140} height={17} style={{ marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(370px, 1fr))', gap: 20 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, overflow: 'hidden' }}>
              <Skeleton height={380} radius={0} />
              <div style={{ padding: '16px 18px 14px' }}>
                <Skeleton width={90} height={13.5} style={{ marginBottom: 16 }} />
                <div style={{ display: 'flex', gap: 12 }}>
                  <Skeleton height={34} radius={10} style={{ flex: 1 }} />
                  <Skeleton height={34} radius={10} style={{ flex: 1 }} />
                  <Skeleton height={34} radius={10} style={{ flex: 1 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px 60px' }}>
      <div onClick={() => navigate(-1)} style={{ cursor: 'pointer', color: '#166534', fontWeight: 600, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={16} /> Back
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>Cow {cow.cowsId}</h1>
          <p style={{ fontSize: 13.5, color: '#82796a', margin: 0 }}>Track and manage upload history for this cow</p>
        </div>
        <button
          onClick={() => navigate('/upload')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 18px', borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <Plus size={16} /> Upload New Data
        </button>
      </div>

      <div data-testid="cow-stats" style={{ display: 'flex', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, marginBottom: 30 }}>
        <StatCard icon={ClipboardList} value={analyses.length} label="Total Uploads" />
        <div style={{ width: 1, background: '#eee8d8', margin: '18px 0' }} />
        <StatCard icon={CheckCircle2} value={completedCount} label="Completed" />
        <div style={{ width: 1, background: '#eee8d8', margin: '18px 0' }} />
        <StatCard icon={CalendarDays} value={lastScanLabel} label="Last Scan" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Upload History</div>
        <div style={{ fontSize: 13, color: '#82796a', marginTop: 2 }}>All uploads and their completion scores</div>
      </div>
      {analyses.length === 0 && <div style={{ fontSize: 13, color: '#82796a' }}>No uploads yet.</div>}
      <div data-testid="upload-history-groups">
        {groupByDate(analyses).map((group) => (
          <div key={group.key} style={{ marginBottom: 30 }}>
            <div data-testid="day-heading" style={{ fontSize: 14, fontWeight: 700, color: '#82796a', marginBottom: 12 }}>{group.key}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(370px, 1fr))', gap: 20 }}>
              {group.items.map((a) => (
                <AnalysisCard
                  key={a.id}
                  analysis={a}
                  onOpenImages={(images, fallbackImages, index) => setLightbox({ images, fallbackImages, index })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          fallbackImages={lightbox.fallbackImages}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox((prev) => ({ ...prev, index }))}
        />
      )}
    </div>
  );
}
