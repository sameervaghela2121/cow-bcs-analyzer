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

function buildObjectPath({ cowsId, batchTimestamp, filename }) {
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

module.exports = {
  getStorage,
  sanitizeBatchTimestamp,
  buildObjectPath,
  toGsUri,
  fromGsUri,
  generateUploadUrl,
};
