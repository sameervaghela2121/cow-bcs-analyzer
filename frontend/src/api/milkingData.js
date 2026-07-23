import { apiClient } from './client.js';

export const milkingDataApi = {
  generateUploadUrl: ({ filename, contentType }) =>
    apiClient.post('/milking-data/upload-url', { filename, contentType }).then((r) => r.data),

  importUpload: ({ objectPath }) =>
    apiClient.post('/milking-data/import', { objectPath }).then((r) => r.data),
};
