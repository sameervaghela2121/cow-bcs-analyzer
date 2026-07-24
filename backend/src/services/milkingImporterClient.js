const { GoogleAuth } = require('google-auth-library');
const config = require('../config/env');

// Same identity/audience pattern as imageCompressorClient.js - the deployed
// function is private (--no-allow-unauthenticated), so calls need a
// Google-signed ID token audienced to the function's own URL.
const auth = new GoogleAuth({
  projectId: config.gcs.projectId || undefined,
  keyFilename: config.gcs.keyFile || undefined,
});

async function getAuthHeaders(audience) {
  const client = await auth.getIdTokenClient(audience);
  const headers = await client.getRequestHeaders();
  return Object.fromEntries(headers.entries());
}

// Unlike triggerCompression, callers must NOT swallow a failure here - a
// failed import means zero milking data was written to Mongo, not a merely
// degraded (thumbnail-less) success, so the error must propagate to the caller.
async function triggerMilkingImport({ bucketName, objectPath }) {
  if (config.milking.importerUrl) {
    const headers = await getAuthHeaders(config.milking.importerUrl);
    const response = await fetch(config.milking.importerUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketName, objectPath }),
    });
    if (!response.ok) {
      // The Cloud Function replies with { error: <message> } - for a bad
      // file (status 400) that message is meaningful and meant to reach the
      // end user as-is (see errorHandler.js: status < 500 passes err.message
      // straight through). Anything else falls back to a generic message,
      // consistent with hiding technical detail on real system faults.
      const body = await response.json().catch(() => null);
      const err = new Error(body?.error || `milking-data-importer request failed (${response.status})`);
      err.status = response.status;
      throw err;
    }
    return response.json();
  }

  // eslint-disable-next-line global-require
  const { importMilkingFile } = require('../../../milking-data-importer/src/importHandler');
  return importMilkingFile({ bucketName, objectPath });
}

module.exports = { triggerMilkingImport };
