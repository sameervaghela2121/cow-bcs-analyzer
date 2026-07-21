import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ImagePlus, UploadCloud, X } from 'lucide-react';
import { bcsAnalysisApi, putFileToGcs, analyzeBcsRecord } from '../api/bcsAnalysis.js';
import { cowsApi } from '../api/cows.js';
import { Button, Card, PageHeader, TextInput } from '../components/ui/index.js';
import { color, radius, shadow, softTint, transition } from '../styles/tokens.js';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SAFE_COWS_ID = /^[A-Za-z0-9._-]{1,128}$/;
const EXTENSION_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const PHASE_LABEL = {
  preparing: 'Preparing upload…',
  uploading: 'Uploading',
  finalizing: 'Saving…',
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const UNSAFE_FILENAME_CHARS = /[^A-Za-z0-9._-]+/g;

// Original filenames can contain spaces/unicode/anything - the backend only
// accepts [A-Za-z0-9._-] (and caps length at 128), so we sanitize rather
// than trust File.name outright, while still keeping it recognizable
// instead of discarding it for a generic "photo-N". `usedNames` dedupes
// within one batch, since GCS object paths are flat per folder and two
// sanitized-to-the-same-name files would otherwise silently overwrite
// each other.
function safeFilename(file, index, usedNames) {
  const ext = EXTENSION_BY_TYPE[file.type] || (file.name.split('.').pop() || 'bin').toLowerCase().replace(UNSAFE_FILENAME_CHARS, '') || 'bin';
  const rawBase = file.name.replace(/\.[^.]*$/, '');
  const base = rawBase
    .replace(UNSAFE_FILENAME_CHARS, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100) || `photo-${index + 1}`;

  let candidate = `${base}.${ext}`;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}-${suffix}.${ext}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

// `progress` is only passed once the batch is uploading (0-100). Left
// undefined in the editable pre-submit list, where the remove button shows
// instead.
function FilePreview({ file, onRemove, progress }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div style={{ position: 'relative', width: 96 }}>
      <div style={{ width: 96, height: 96, borderRadius: radius.input, overflow: 'hidden', background: color.hover, border: `1px solid ${color.border}`, position: 'relative' }}>
        {previewUrl && <img src={previewUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        {progress != null && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {progress >= 100 ? <Check size={26} color="#fff" /> : <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{progress}%</span>}
          </div>
        )}
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove"
          style={{
            position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: '50%',
            border: '2px solid #fff', background: color.primary, color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition,
          }}
        >
          <X size={12} />
        </button>
      )}
      <div style={{ fontSize: 11, color: color.textSecondary, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.name}
      </div>
      <div style={{ fontSize: 10.5, color: color.textMuted }}>{formatBytes(file.size)}</div>
    </div>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [cowId, setCowId] = useState('');
  const [selectedCow, setSelectedCow] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRequestId = useRef(0);
  const [error, setError] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState(null); // 'preparing' | 'uploading' | 'finalizing'
  const [uploadProgress, setUploadProgress] = useState({}); // fileId -> { loaded, total }

  const locked = submitting;

  const uploadedBytes = Object.values(uploadProgress).reduce((sum, p) => sum + p.loaded, 0);
  const totalBytes = Object.values(uploadProgress).reduce((sum, p) => sum + p.total, 0);
  const uploadPercent = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  // Debounced cow-ID search: skips while a cow is already locked in, or the
  // field is empty. searchRequestId guards against a slow earlier response
  // clobbering a faster later one when the user keeps typing.
  useEffect(() => {
    if (selectedCow || locked) return;
    const query = cowId.trim();
    if (!query) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const requestId = ++searchRequestId.current;
    const timer = setTimeout(async () => {
      try {
        const { cows } = await cowsApi.list({ search: query, limit: 8 });
        if (searchRequestId.current === requestId) {
          setSuggestions(cows);
          setShowSuggestions(true);
        }
      } catch {
        if (searchRequestId.current === requestId) setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cowId, selectedCow, locked]);

  function selectCow(cow) {
    setSelectedCow(cow);
    setCowId(cow.cowsId);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  function clearSelectedCow() {
    setSelectedCow(null);
    setCowId('');
    setShowSuggestions(false);
  }

  function handleFiles(fileList) {
    const incoming = Array.from(fileList);
    const accepted = incoming.filter((file) => ACCEPTED_TYPES.includes(file.type));
    if (accepted.length < incoming.length) {
      setError('Some files were skipped — only JPEG, PNG, or WEBP photos are supported.');
    } else {
      setError(null);
    }
    if (accepted.length === 0) return;
    const newFiles = accepted.map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file }));
    setPendingFiles((prev) => [...prev, ...newFiles]);
  }

  function handleDragOver(e) {
    if (locked) return;
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    if (locked) return;
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  function removeFile(id) {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function submitBatch() {
    const cowsId = cowId.trim();
    if (!cowsId) {
      setError('Enter a Cow ID before uploading.');
      return;
    }
    if (!SAFE_COWS_ID.test(cowsId)) {
      setError("Cow ID may only contain letters, numbers, '.', '_', '-'.");
      return;
    }
    if (pendingFiles.length === 0) {
      setError('Choose at least one photo.');
      return;
    }
    setError(null);
    setSubmitting(true);
    setPhase('preparing');
    setUploadProgress({});
    try {
      const usedFilenames = new Set();
      const namedFiles = pendingFiles.map(({ file }, i) => ({ file, filename: safeFilename(file, i, usedFilenames) }));

      // 1. Backend finds-or-creates the cow and hands back one signed GCS
      //    upload URL per file, all in the same cowsId/<batchTimestamp>/ folder.
      const { uploads } = await bcsAnalysisApi.generateUploadUrls({
        cowsId,
        files: namedFiles.map(({ file, filename }) => ({ filename, contentType: file.type })),
      });

      // 2. Upload every file straight to GCS in parallel, tracking bytes sent
      //    per file so the UI can show a real aggregate percentage. If any
      //    one fails, abort before creating a record that would reference a
      //    missing image.
      setPhase('uploading');
      setUploadProgress(
        Object.fromEntries(pendingFiles.map((f, i) => [f.id, { loaded: 0, total: namedFiles[i].file.size }]))
      );
      await Promise.all(
        uploads.map((upload, i) => {
          const fileId = pendingFiles[i].id;
          return putFileToGcs(upload.uploadUrl, namedFiles[i].file, (loaded, total) => {
            setUploadProgress((prev) => ({ ...prev, [fileId]: { loaded, total } }));
          });
        })
      );

      // 3. Create the bcs_analysis record referencing the uploaded images.
      setPhase('finalizing');
      const analysis = await bcsAnalysisApi.create({
        cowsId,
        cowsImages: uploads.map((u) => u.gsUri),
      });

      // 4. Kick off scoring on the AI backend directly. Even if this call
      //    fails, the record now exists, so move on to the cow's detail
      //    page - it'll show as "Waiting to start" and keep polling.
      try {
        await analyzeBcsRecord(analysis.id);
      } catch {
        // best-effort trigger - the detail page is the source of truth from here
      }

      // Land on the herd grid (not this cow's own detail page) so the user
      // sees its status pill update alongside every other cow, rather than
      // being dropped into a single-cow view right after uploading.
      navigate('/herd');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed.');
      setSubmitting(false);
      setPhase(null);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 28px 60px' }}>
      <PageHeader title="Upload Photos" subtitle="Upload one or more photos of the same cow." />

      <Card padding={24}>
        <label htmlFor="upload-cow-id" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: color.textPrimary, marginBottom: 8 }}>
          Cow ID (search or enter new)
        </label>

        {selectedCow ? (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                border: `1px solid ${color.border}`, borderRadius: radius.input, background: color.primarySoft,
                fontSize: 15, fontWeight: 700, color: color.primaryDark,
              }}
            >
              <span>Cow #{selectedCow.cowsId}</span>
              {!locked && (
                <button
                  onClick={clearSelectedCow}
                  title="Clear"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', color: color.primaryDark }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <TextInput
              id="upload-cow-id" value={cowId} onChange={(e) => setCowId(e.target.value)} disabled={locked}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => setShowSuggestions(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowSuggestions(false); }}
              placeholder="e.g. 4417"
              autoComplete="off"
              style={{ fontSize: 16 }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: color.bgCard,
                  border: `1px solid ${color.border}`, borderRadius: radius.input, boxShadow: shadow.raised, zIndex: 10,
                  maxHeight: 220, overflowY: 'auto',
                }}
              >
                {suggestions.map((cow, i) => (
                  <div
                    key={cow.id}
                    // onMouseDown (not onClick) fires before the input's onBlur closes the dropdown.
                    onMouseDown={(e) => { e.preventDefault(); selectCow(cow); }}
                    style={{
                      padding: '10px 14px', fontSize: 14.5, cursor: 'pointer', color: color.textPrimary,
                      borderBottom: i === suggestions.length - 1 ? 'none' : `1px solid ${color.hover}`,
                    }}
                  >
                    Cow - {cow.cowsId}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ ...softTint(color.danger), fontSize: 13, fontWeight: 500, padding: '10px 14px', borderRadius: radius.input, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!locked && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              position: 'relative',
              border: `2px dashed ${isDragging ? color.primary : color.border}`,
              borderRadius: radius.card,
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: isDragging ? color.primarySoft : color.hover,
              transition,
            }}
          >
            {isDragging ? (
              <UploadCloud size={32} style={{ marginBottom: 8, color: color.primary }} />
            ) : (
              <ImagePlus size={32} style={{ marginBottom: 8, color: color.textMuted }} />
            )}
            <div style={{ fontSize: 14.5, fontWeight: 600, color: color.textPrimary, marginBottom: 3 }}>
              {isDragging ? 'Drop to add' : 'Drag & drop photos here'}
            </div>
            <div style={{ fontSize: 12.5, color: color.textSecondary }}>
              or <span style={{ color: color.primary, fontWeight: 600, textDecoration: 'underline' }}>browse files</span>
            </div>
            <input
              ref={fileInputRef}
              id="upload-file-input" aria-label="Choose file" type="file" accept="image/jpeg,image/png,image/webp" multiple
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = ''; }}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            />
          </div>
        )}

        {!locked && pendingFiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 20 }}>
            {pendingFiles.map((item) => (
              <FilePreview key={item.id} file={item.file} onRemove={() => removeFile(item.id)} />
            ))}
          </div>
        )}

        {!locked && pendingFiles.length > 0 && (
          <Button variant="primary" size="lg" onClick={submitBatch} disabled={submitting} style={{ width: '100%', marginTop: 20 }}>
            Upload Photos
          </Button>
        )}

        {locked && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
              {pendingFiles.map((item) => {
                const p = uploadProgress[item.id];
                const pct =
                  phase === 'uploading' ? (p && p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0) : phase === 'finalizing' ? 100 : 0;
                return <FilePreview key={item.id} file={item.file} progress={pct} />;
              })}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between', color: color.textPrimary }}>
              <span>{PHASE_LABEL[phase] || 'Uploading…'}</span>
              {phase === 'uploading' && <span>{uploadPercent}%</span>}
            </div>
            <div style={{ height: 8, borderRadius: radius.chip, background: color.hover, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${phase === 'uploading' ? uploadPercent : phase === 'finalizing' ? 100 : 8}%`,
                  background: color.primary,
                  borderRadius: radius.chip,
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
