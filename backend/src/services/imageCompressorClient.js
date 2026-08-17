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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A single BCS analysis can carry several photos, each triggering
// compression in parallel (see bcsAnalysisController.js) - a large enough
// batch can outrun the function's --max-instances=5 cap while it's scaled
// to zero, since Cloud Run can't spin up that many instances instantly. The
// overflow comes back as 429 "Rate exceeded" rather than being queued -
// that's transient congestion, not a real failure, so it's worth a couple
// of short retries before giving up.
const RATE_LIMITED_STATUS = 429;
const RETRY_DELAYS_MS = [300, 900];

async function triggerCompression({ bucketName, objectPath }) {
  if (config.imageCompressor.url) {
    const headers = await getAuthHeaders(config.imageCompressor.url);
    const body = JSON.stringify({ bucketName, objectPath });

    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(config.imageCompressor.url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body,
      });
      if (response.ok) return;

      const text = await response.text().catch(() => '');
      if (response.status !== RATE_LIMITED_STATUS || attempt >= RETRY_DELAYS_MS.length) {
        throw new Error(`image-compressor request failed (${response.status}): ${text}`);
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  // eslint-disable-next-line global-require
  const { compressAndStoreVariants } = require('../../../image-compressor/src/compress');
  await compressAndStoreVariants({ bucketName, objectPath });
}

module.exports = { triggerCompression };
