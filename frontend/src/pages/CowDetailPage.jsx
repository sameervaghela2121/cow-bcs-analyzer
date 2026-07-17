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
// or last photo.
function Lightbox({ images, index, onClose, onNavigate }) {
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
        src={images[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
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

// Shows just the first photo as a cover thumbnail with a "+N" badge for the
// rest, rather than a row of tiny images - clicking it opens the full
// gallery for that analysis, starting from that photo.
function AnalysisImages({ imageUrls, onOpen }) {
  if (!imageUrls?.length) return null;
  const extra = imageUrls.length - 1;
  return (
    <div
      onClick={() => onOpen(imageUrls, 0)}
      role="button"
      tabIndex={0}
      aria-label={`View ${imageUrls.length} photo${imageUrls.length === 1 ? '' : 's'}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(imageUrls, 0); }}
      style={{ position: 'relative', width: 52, height: 52, borderRadius: 8, overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}
    >
      <img src={imageUrls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {extra > 0 && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

// mean_bcs_score is a root-level field on the analysis (a sibling of
// bcsScore, not nested inside it) - the average of final_bcs across
// whichever providers succeeded (computed server-side in ai-backend) -
// shown as the single overall score rather than breaking it out per-provider.
function MeanScore({ score }) {
  if (score == null) return null;
  const band = bandFor(score);
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: band.color }}>{formatScore(score)}</div>
      <div style={{ fontSize: 11, color: '#82796a' }}>{band.label}</div>
    </div>
  );
}

// Self-polls every 10s while pending (via usePollBcsAnalysis), stops once
// completed/failed. Records that were already done when the list loaded
// never start polling at all.
function AnalysisRow({ analysis: initial, onOpenImages }) {
  const pending = PENDING_STATUSES.has(initial.status);
  const { analysis: polled } = usePollBcsAnalysis(pending ? initial.id : null);
  const analysis = polled || initial;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 14px' }}>
      <AnalysisImages imageUrls={analysis.imageUrls} onOpen={onOpenImages} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{fmtDate(analysis.createdAt)}</div>
        <div style={{ fontSize: 12, color: statusColor(analysis.status), marginTop: 2, fontWeight: 600 }}>
          {statusLabel(analysis.status)}
          {analysis.status === 'failed' && analysis.errorMessage ? `: ${analysis.errorMessage}` : ''}
        </div>
      </div>
      {analysis.status === 'completed' && <MeanScore score={analysis.mean_bcs_score} />}
    </div>
  );
}

export default function CowDetailPage() {
  const { cowsId } = useParams();
  const navigate = useNavigate();
  const [lightbox, setLightbox] = useState(null); // { images, index } | null

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

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Upload History</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {analyses.length === 0 && <div style={{ fontSize: 13, color: '#82796a' }}>No uploads yet.</div>}
        {analyses.map((a) => (
          <AnalysisRow key={a.id} analysis={a} onOpenImages={(images, index) => setLightbox({ images, index })} />
        ))}
      </div>

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox((prev) => ({ ...prev, index }))}
        />
      )}
    </div>
  );
}
