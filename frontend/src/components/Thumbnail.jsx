import { useEffect, useState } from 'react';
import { apiClient } from '../api/client.js';

export default function Thumbnail({ readingId, size = 58 }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    apiClient.get(`/readings/${readingId}/media`, { responseType: 'blob' }).then((res) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(res.data);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [readingId]);

  if (!url) {
    return <div style={{ width: size, height: size, borderRadius: 8, background: '#F3F4F6', flexShrink: 0 }} />;
  }
  return <img src={url} alt="" style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />;
}
