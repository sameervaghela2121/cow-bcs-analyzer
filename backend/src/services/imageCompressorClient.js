const { GoogleAuth } = require('google-auth-library');
const config = require('../config/env');

// The deployed Cloud Function is private (--no-allow-unauthenticated), so
// calls need a Google-signed ID token audienced to the function's own URL.
// GoogleAuth resolves credentials the same way gcsService's Storage client
// does - the bcs-backend-uploader key file locally (GCS_KEY_FILE), or the
// attached service account's identity automatically when actually running
// on Cloud Run in production. Either way it's the same bcs-backend-uploader
// identity, which already has run.invoker on the function.
const auth = new GoogleAuth({
  projectId: config.gcs.projectId || undefined,
  keyFilename: config.gcs.keyFile || undefined,
});

async function getAuthHeaders(audience) {
  const client = await auth.getIdTokenClient(audience);
  // getRequestHeaders() returns a Fetch API Headers instance, not a plain
  // object - {...headers} silently drops everything, so convert explicitly.
  const headers = await client.getRequestHeaders();
  return Object.fromEntries(headers.entries());
}

async function triggerCompression({ bucketName, objectPath }) {
  if (config.imageCompressor.url) {
    const headers = await getAuthHeaders(config.imageCompressor.url);
    const response = await fetch(config.imageCompressor.url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketName, objectPath }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`image-compressor request failed (${response.status}): ${text}`);
    }
    return;
  }

  // eslint-disable-next-line global-require
  const { compressAndStoreVariants } = require('../../../image-compressor/src/compress');
  await compressAndStoreVariants({ bucketName, objectPath });
}

module.exports = { triggerCompression };
