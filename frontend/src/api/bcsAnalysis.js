import { apiClient } from './client.js';

const AI_BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8000';

export const bcsAnalysisApi = {
  // files: [{ filename, contentType }]
  generateUploadUrls: ({ cowsId, files }) =>
    apiClient.post('/bcs-analysis/upload-urls', { cowsId, files }).then((r) => r.data),

  create: ({ cowsId, cowsImages }) =>
    apiClient.post('/bcs-analysis', { cowsId, cowsImages }).then((r) => r.data.bcsAnalysis),

  get: (id) => apiClient.get(`/bcs-analysis/${id}`).then((r) => r.data.bcsAnalysis),

  approve: (id) => apiClient.patch(`/bcs-analysis/${id}/approve`).then((r) => r.data.bcsAnalysis),
};

// Uploads go straight to GCS via a signed URL, never through the Node
// backend - a raw request on purpose, so apiClient's Authorization header
// (our own API bearer token) is never sent to storage.googleapis.com.
// contentType must match exactly what the signed URL was generated with.
//
// XMLHttpRequest instead of fetch: fetch has no upload-progress event, only
// XHR's `upload.onprogress` reports bytes sent as a large image streams to
// GCS, which is what lets the UI show a real percentage instead of just an
// indeterminate spinner.
export function putFileToGcs(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      onProgress?.(e.loaded, e.lengthComputable ? e.total : file.size);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(file.size, file.size);
        resolve();
      } else {
        reject(new Error(`Upload to storage failed (${xhr.status}) for ${file.name}.`));
      }
    };
    xhr.onerror = () => reject(new Error(`Upload to storage failed (network error) for ${file.name}.`));
    xhr.send(file);
  });
}

// The AI backend is called directly from the browser, not through Node -
// different service, different base URL, no auth header.
export async function analyzeBcsRecord(id) {
  const res = await fetch(`${AI_BACKEND_URL}/api/bcs/analyze/${id}`, { method: 'POST' });
  if (!res.ok) {
    let message = `Starting analysis failed (${res.status}).`;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch {
      // response wasn't JSON - keep the default message
    }
    throw new Error(message);
  }
  return res.json();
}
