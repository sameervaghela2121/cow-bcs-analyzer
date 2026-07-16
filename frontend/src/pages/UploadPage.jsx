import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readingsApi } from '../api/readings.js';
import { usePollReading } from '../hooks/usePollReading.js';
import { bandFor, formatScore } from '../domain/bcs.js';

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [cowId, setCowId] = useState('');
  const [error, setError] = useState(null);
  const [readingId, setReadingId] = useState(null);

  const { reading, isDone } = usePollReading(readingId);

  async function handleFile(file) {
    if (!cowId.trim()) {
      setError('Enter a Cow ID before uploading.');
      return;
    }
    setError(null);
    try {
      const { readingId: id } = await readingsApi.upload({ cowId: cowId.trim(), file });
      setReadingId(id);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    }
  }

  function uploadAnother() {
    setReadingId(null);
    setCowId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Upload BCS Reading</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 28px' }}>Upload a photo from the parlor exit or feeding lane.</p>

      <label htmlFor="upload-cow-id" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Cow ID</label>
      <input
        id="upload-cow-id" value={cowId} onChange={(e) => setCowId(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 16, border: '1px solid #d8d2c2', borderRadius: 8, marginBottom: 20 }}
      />

      {error && <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {!readingId && (
        <div style={{ border: '2px dashed #c7c0ac', borderRadius: 12, padding: '44px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>&#128247;</div>
          <label htmlFor="upload-file-input" style={{ fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Choose file</label>
          <input
            id="upload-file-input" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
            style={{ display: 'block', margin: '10px auto 0' }}
          />
        </div>
      )}

      {readingId && !isDone && (
        <div style={{ border: '1px solid #e2ddd0', borderRadius: 12, padding: '36px 28px', background: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Extracting frame &amp; scoring&hellip;</div>
        </div>
      )}

      {isDone && reading?.status === 'scored' && (
        <div style={{ border: '1px solid #e2ddd0', borderRadius: 12, padding: 24, background: '#fff' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 16 }}>&#10003; Reading saved</div>
          <div style={{ fontSize: 12, color: '#82796a' }}>BCS Score</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: bandFor(reading.score).color }}>{formatScore(reading.score)}</div>
          {reading.flagged && <div style={{ marginTop: 10, fontSize: '12.5px', color: '#b91c1c', fontWeight: 600 }}>&#9873; Flagged for review</div>}
          <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
            <button onClick={uploadAnother} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Upload another</button>
            <button onClick={() => navigate(`/herd/${cowId}`)} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer' }}>View cow history</button>
          </div>
        </div>
      )}

      {isDone && reading?.status === 'failed' && (
        <div style={{ background: '#fbe4e4', color: '#b91c1c', padding: '16px 18px', borderRadius: 12 }}>
          Scoring failed: {reading.errorMessage}
          <div style={{ marginTop: 12 }}>
            <button onClick={uploadAnother} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}
