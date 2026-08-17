import { apiClient } from './client.js';

export const milkingDataApi = {
  generateUploadUrl: ({ filename, contentType }) =>
    apiClient.post('/milking-data/upload-url', { filename, contentType }).then((r) => r.data),

  importUpload: ({ objectPath, milkingDate }) =>
    apiClient.post('/milking-data/import', { objectPath, milkingDate }).then((r) => r.data),

  summary: (params = {}) => apiClient.get('/milking-data/summary', { params }).then((r) => r.data),

  records: (params = {}) => apiClient.get('/milking-data/records', { params }).then((r) => r.data),
};
