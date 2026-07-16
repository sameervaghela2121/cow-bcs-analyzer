import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ImagePlus, UploadCloud, X, XCircle } from 'lucide-react';
import { readingsApi } from '../api/readings.js';
import { usePollReading } from '../hooks/usePollReading.js';
import { bandFor, formatScore } from '../domain/bcs.js';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePreview({ file, onRemove }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div style={{ position: 'relative', width: 96 }}>
      <div style={{ width: 96, height: 96, borderRadius: 10, overflow: 'hidden', background: '#efece1', border: '1px solid #e5e0d3' }}>
        {previewUrl && <img src={previewUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>
      <button
        onClick={onRemove}
        title="Remove"
        style={{
          position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: '50%',
          border: '2px solid #fff', background: '#1c2a20', color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
      >
        <X size={12} />
      </button>
      <div style={{ fontSize: 11, color: '#82796a', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.name}
      </div>
      <div style={{ fontSize: 10.5, color: '#a39c86' }}>{formatBytes(file.size)}</div>
    </div>
  );
}

function BatchStatus({ readingId, fileCount }) {
  const { reading, isDone } = usePollReading(readingId);

  return (
    <div style={{ border: '1px solid #e5e0d3', borderRadius: 14, padding: '18px 20px', background: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700 }}>{fileCount} photo{fileCount === 1 ? '' : 's'}</div>
        {!isDone && (
          <div style={{ fontSize: 12.5, color: '#82796a', marginTop: 4 }}>Extracting frames &amp; scoring…</div>
        )}
        {isDone && reading?.status === 'scored' && (
          <div style={{ fontSize: 12.5, color: '#166534', marginTop: 4, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle2 size={14} /> Reading saved{reading.flagged ? ' — flagged for review' : ''}
          </div>
        )}
        {isDone && reading?.status === 'failed' && (
          <div style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <XCircle size={14} /> Scoring failed: {reading.errorMessage}
          </div>
        )}
      </div>
      {isDone && reading?.status === 'scored' && (
        <div style={{ fontSize: 22, fontWeight: 800, color: bandFor(reading.score).color }}>{formatScore(reading.score)}</div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [cowId, setCowId] = useState('');
  const [error, setError] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [readingId, setReadingId] = useState(null);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const locked = submitting || !!readingId;

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
    if (!cowId.trim()) {
      setError('Enter a Cow ID before uploading.');
      return;
    }
    if (pendingFiles.length === 0) {
      setError('Choose at least one photo.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { readingId: id } = await readingsApi.upload({ cowId, files: pendingFiles.map((f) => f.file) });
      setSubmittedCount(pendingFiles.length);
      setReadingId(id);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function uploadMore() {
    setPendingFiles([]);
    setReadingId(null);
    setSubmittedCount(0);
    setCowId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Upload BCS Reading</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 24px' }}>
        Upload one or more photos of the same cow — they'll be scored together as a single reading.
      </p>

      <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, padding: 24 }}>
        <label htmlFor="upload-cow-id" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Cow ID</label>
        <input
          id="upload-cow-id" value={cowId} onChange={(e) => setCowId(e.target.value)} disabled={locked}
          placeholder="e.g. 4417"
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 16, border: '1px solid #d8d2c2', borderRadius: 8, marginBottom: 20 }}
        />

        {error && <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}

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
              border: `2px dashed ${isDragging ? '#166534' : '#c7c0ac'}`,
              borderRadius: 12,
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: isDragging ? '#eef4ee' : '#fbfaf6',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {isDragging ? (
              <UploadCloud size={32} style={{ marginBottom: 8, color: '#166534' }} />
            ) : (
              <ImagePlus size={32} style={{ marginBottom: 8, color: '#a39c86' }} />
            )}
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 3 }}>
              {isDragging ? 'Drop to add' : 'Drag & drop photos here'}
            </div>
            <div style={{ fontSize: 12.5, color: '#82796a' }}>
              or <span style={{ color: '#166534', fontWeight: 600, textDecoration: 'underline' }}>browse files</span>
            </div>
            <input
              ref={fileInputRef}
              id="upload-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple
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
          <button
            onClick={submitBatch}
            disabled={submitting}
            style={{ width: '100%', padding: '13px 20px', borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, marginTop: 20 }}
          >
            {submitting ? 'Uploading…' : `Score ${pendingFiles.length} photo${pendingFiles.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {readingId && (
        <div style={{ marginTop: 20 }}>
          <BatchStatus readingId={readingId} fileCount={submittedCount} />
        </div>
      )}

      {readingId && (
        <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
          <button onClick={uploadMore} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Upload another</button>
          <button onClick={() => navigate(`/herd/${cowId}`)} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>View cow history</button>
        </div>
      )}
    </div>
  );
}
