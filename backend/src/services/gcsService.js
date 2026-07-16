const { Storage } = require('@google-cloud/storage');
const config = require('../config/env');

let storageClient;

function getStorage() {
  if (!storageClient) {
    storageClient = new Storage({
      projectId: config.gcs.projectId || undefined,
      keyFilename: config.gcs.keyFile || undefined,
    });
  }
  return storageClient;
}

function sanitizeBatchTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;

function assertSafePathSegment(value, label) {
  if (typeof value !== 'string' || !SAFE_PATH_SEGMENT.test(value)) {
    const err = new Error(`Invalid ${label}: only letters, numbers, '.', '_', '-' are allowed.`);
    err.status = 400;
    throw err;
  }
}

function buildObjectPath({ cowsId, batchTimestamp, filename }) {
  assertSafePathSegment(cowsId, 'cowsId');
  assertSafePathSegment(batchTimestamp, 'batchTimestamp');
  assertSafePathSegment(filename, 'filename');
  return `${cowsId}/${batchTimestamp}/${filename}`;
}

function toGsUri(objectPath) {
  return `gs://${config.gcs.bucketName}/${objectPath}`;
}

function fromGsUri(gsUri) {
  const withoutScheme = gsUri.replace(/^gs:\/\//, '');
  const [bucket, ...rest] = withoutScheme.split('/');
  return { bucket, objectPath: rest.join('/') };
}

async function generateUploadUrl({ objectPath, contentType }) {
  const bucket = getStorage().bucket(config.gcs.bucketName);
  const file = bucket.file(objectPath);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + config.gcs.signedUrlExpiryMs,
    contentType,
  });
  return url;
}

async function generateReadUrl({ objectPath }) {
  const bucket = getStorage().bucket(config.gcs.bucketName);
  const file = bucket.file(objectPath);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + config.gcs.signedUrlExpiryMs,
  });
  return url;
}

module.exports = {
  getStorage,
  sanitizeBatchTimestamp,
  buildObjectPath,
  toGsUri,
  fromGsUri,
  generateUploadUrl,
  generateReadUrl,
};
