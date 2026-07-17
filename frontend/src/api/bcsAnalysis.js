import { apiClient } from './client.js';

const AI_BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8000';

export const bcsAnalysisApi = {
  // files: [{ filename, contentType }]
  generateUploadUrls: ({ cowsId, files }) =>
    apiClient.post('/bcs-analysis/upload-urls', { cowsId, files }).then((r) => r.data),

  create: ({ cowsId, cowsImages }) =>
    apiClient.post('/bcs-analysis', { cowsId, cowsImages }).then((r) => r.data.bcsAnalysis),

  get: (id) => apiClient.get(`/bcs-analysis/${id}`).then((r) => r.data.bcsAnalysis),
};

// Uploads go straight to GCS via a signed URL, never through the Node
// backend - plain fetch on purpose, so apiClient's Authorization header
// (our own API bearer token) is never sent to storage.googleapis.com.
// contentType must match exactly what the signed URL was generated with.
export async function putFileToGcs(uploadUrl, file) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Upload to storage failed (${res.status}) for ${file.name}.`);
  }
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
