import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cowsApi } from '../api/cows.js';
import { usePollBcsAnalysis } from '../hooks/usePollBcsAnalysis.js';
import { statusLabel, statusColor, PENDING_STATUSES } from '../domain/analysisStatus.js';
import { formatScore, bandFor } from '../domain/bcs.js';

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Full-screen viewer for one analysis's photos. Wraps around at both ends
// so left/right always does something instead of going dead at the first
// or last photo. `images` is the compressed "display" variant (fast to
// load); `fallbackImages` is the original, used per-photo if that variant
// 404s (compression still pending, or a record from before this feature).
function Lightbox({ images, fallbackImages, index, onClose, onNavigate }) {
  const [failedIndices, setFailedIndices] = useState(() => new Set());
  const src = failedIndices.has(index) ? (fallbackImages?.[index] ?? images[index]) : images[index];

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
    width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <button onClick={onClose} aria-label="Close" style={{ ...iconButtonStyle, position: 'absolute', top: 18, right: 18 }}>
        <X size={20} />
      </button>

      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate((index - 1 + images.length) % images.length); }}
          aria-label="Previous image"
          style={{ ...iconButtonStyle, position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)' }}
        >
          <ChevronLeft size={24} />
        </button>
      )}

      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        onError={() => setFailedIndices((prev) => new Set(prev).add(index))}
        style={{ maxWidth: '85vw', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }}
      />

      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate((index + 1) % images.length); }}
          aria-label="Next image"
          style={{ ...iconButtonStyle, position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)' }}
        >
          <ChevronRight size={24} />
        </button>
      )}

      {images.length > 1 && (
        <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 13, fontWeight: 600 }}>
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

// One upload batch as a card, sized to sit in a horizontal row alongside
// other cards from the same day. Self-polls every 10s while pending (via
// usePollBcsAnalysis), stops once completed/failed. Cover photo uses the
// compressed "600X600" display variant rather than the 300X300 thumbnail -
// at this card size the 300X300 would be upscaled (worse on Retina, which
// needs 2x the pixels for a sharp render) - falling back to the original if
// it 404s. The opened gallery uses the same 600X600 variant.
function AnalysisCard({ analysis: initial, onOpenImages }) {
  const pending = PENDING_STATUSES.has(initial.status);
  const { analysis: polled } = usePollBcsAnalysis(pending ? initial.id : null);
  const analysis = polled || initial;
  const [coverFailed, setCoverFailed] = useState(false);

  const imageUrls = analysis.imageUrls || [];
  const hasImages = imageUrls.length > 0;
  const extra = imageUrls.length - 1;
  const coverSrc = hasImages && (!coverFailed && analysis.displayUrls?.[0] ? analysis.displayUrls[0] : imageUrls[0]);

  function openGallery() {
    if (!hasImages) return;
    const displayUrls = analysis.displayUrls;
    onOpenImages(displayUrls?.length ? displayUrls : imageUrls, imageUrls, 0);
  }

  return (
    <div style={{ width: 300, flexShrink: 0, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, overflow: 'hidden' }}>
      <div
        onClick={openGallery}
        role={hasImages ? 'button' : undefined}
        tabIndex={hasImages ? 0 : undefined}
        aria-label={hasImages ? `View ${imageUrls.length} photo${imageUrls.length === 1 ? '' : 's'}` : undefined}
        onKeyDown={(e) => { if (hasImages && (e.key === 'Enter' || e.key === ' ')) openGallery(); }}
        style={{ position: 'relative', height: 210, background: '#f2f0e8', cursor: hasImages ? 'pointer' : 'default' }}
      >
        {coverSrc && (
          <img
            src={coverSrc}
            alt=""
            onError={() => setCoverFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        {extra > 0 && (
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 13, fontWeight: 700, borderRadius: 8, padding: '3px 8px' }}>
            +{extra}
          </div>
        )}
      </div>
      <div style={{ padding: '14px 16px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 13, color: statusColor(analysis.status), fontWeight: 700 }}>
          {statusLabel(analysis.status)}
          {analysis.status === 'failed' && analysis.errorMessage ? `: ${analysis.errorMessage}` : ''}
        </div>
        {analysis.status === 'completed' && <ScoreBadge score={analysis.final_bcs ?? analysis.medianScore} />}
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

  if (!cow) return <div style={{ padding: 28 }}>Loading&hellip;</div>;

  return (
    <div style={{ padding: '28px 28px 60px' }}>
      <div onClick={() => navigate(-1)} style={{ cursor: 'pointer', color: '#166534', fontWeight: 600, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={16} /> Back
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 22px' }}>Cow {cow.cowsId}</h1>

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Upload History</div>
      {analyses.length === 0 && <div style={{ fontSize: 13, color: '#82796a' }}>No uploads yet.</div>}
      {groupByDate(analyses).map((group) => (
        <div key={group.key} style={{ marginBottom: 30 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#82796a', marginBottom: 12 }}>{group.key}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
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
