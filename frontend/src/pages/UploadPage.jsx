import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readingsApi } from '../api/readings.js';
import { usePollReading } from '../hooks/usePollReading.js';
import { bandFor, formatScore } from '../domain/bcs.js';

function UploadItem({ cowId, file }) {
  const [readingId, setReadingId] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const { reading, isDone } = usePollReading(readingId);

  useEffect(() => {
    let cancelled = false;
    readingsApi.upload({ cowId, file })
      .then(({ readingId: id }) => { if (!cancelled) setReadingId(id); })
      .catch((err) => { if (!cancelled) setUploadError(err.response?.data?.error || 'Upload failed.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ border: '1px solid #e2ddd0', borderRadius: 12, padding: '14px 16px', background: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
        {uploadError && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{uploadError}</div>}
        {!uploadError && !isDone && (
          <div style={{ fontSize: 12, color: '#82796a', marginTop: 4 }}>{readingId ? 'Extracting frame & scoring…' : 'Uploading…'}</div>
        )}
        {isDone && reading?.status === 'scored' && (
          <div style={{ fontSize: 12, color: '#166534', marginTop: 4, fontWeight: 600 }}>
            &#10003; Reading saved{reading.flagged ? ' — flagged for review' : ''}
          </div>
        )}
        {isDone && reading?.status === 'failed' && (
          <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>Scoring failed: {reading.errorMessage}</div>
        )}
      </div>
      {isDone && reading?.status === 'scored' && (
        <div style={{ fontSize: 20, fontWeight: 800, color: bandFor(reading.score).color }}>{formatScore(reading.score)}</div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [cowId, setCowId] = useState('');
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);

  function handleFiles(fileList) {
    if (!cowId.trim()) {
      setError('Enter a Cow ID before uploading.');
      return;
    }
    setError(null);
    const newItems = Array.from(fileList).map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      file,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  function uploadMore() {
    setItems([]);
    setCowId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Upload BCS Reading</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 28px' }}>Upload one or more photos from the parlor exit or feeding lane.</p>

      <label htmlFor="upload-cow-id" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Cow ID</label>
      <input
        id="upload-cow-id" value={cowId} onChange={(e) => setCowId(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 16, border: '1px solid #d8d2c2', borderRadius: 8, marginBottom: 20 }}
      />

      {error && <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <div style={{ border: '2px dashed #c7c0ac', borderRadius: 12, padding: '44px 20px', textAlign: 'center', marginBottom: items.length ? 20 : 0 }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>&#128247;</div>
        <label htmlFor="upload-file-input" style={{ fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Choose file(s)</label>
        <input
          id="upload-file-input" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
          onChange={(e) => e.target.files.length && handleFiles(e.target.files)}
          style={{ display: 'block', margin: '10px auto 0' }}
        />
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => <UploadItem key={item.id} cowId={cowId} file={item.file} />)}
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
          <button onClick={uploadMore} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Upload another</button>
          <button onClick={() => navigate(`/herd/${cowId}`)} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer' }}>View cow history</button>
        </div>
      )}
    </div>
  );
}
