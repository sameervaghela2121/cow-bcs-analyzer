const { Storage } = require('@google-cloud/storage');
const config = require('../config/env');
const { assertSafePathSegment } = require('./gcsService');

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

function buildDateFolder(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function buildMilkingObjectPath({ dateFolder, filename }) {
  assertSafePathSegment(dateFolder, 'dateFolder');
  assertSafePathSegment(filename, 'filename');
  return `${dateFolder}/${filename}`;
}

function toMilkingGsUri(objectPath) {
  return `gs://${config.milking.bucketName}/${objectPath}`;
}

async function generateMilkingUploadUrl({ objectPath, contentType }) {
  const bucket = getStorage().bucket(config.milking.bucketName);
  const file = bucket.file(objectPath);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + config.gcs.signedUrlExpiryMs,
    contentType,
  });
  return url;
}

async function generateMilkingReadUrl({ objectPath }) {
  const bucket = getStorage().bucket(config.milking.bucketName);
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
  buildDateFolder,
  buildMilkingObjectPath,
  toMilkingGsUri,
  generateMilkingUploadUrl,
  generateMilkingReadUrl,
};
