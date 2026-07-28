const config = require('../config/env');
const {
  buildDateFolder,
  buildMilkingObjectPath,
  toMilkingGsUri,
  generateMilkingUploadUrl,
} = require('../services/milkingGcsService');
const { triggerMilkingImport } = require('../services/milkingImporterClient');

const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,128}$/;
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function generateUploadUrl(req, res, next) {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !SAFE_FILENAME.test(filename)) {
      return res.status(400).json({ error: "filename is required and may only contain letters, numbers, '.', '_', '-'." });
    }
    if (contentType !== XLSX_CONTENT_TYPE) {
      return res.status(400).json({ error: `contentType must be ${XLSX_CONTENT_TYPE}.` });
    }

    // Date folder is always server-generated, never client-supplied, same
    // reasoning as batchTimestamp in the BCS photo upload flow.
    const dateFolder = buildDateFolder();
    const objectPath = buildMilkingObjectPath({
      organizationId: req.scope.organizationId,
      facilityId: req.scope.facilityId,
      dateFolder,
      filename,
    });
    const uploadUrl = await generateMilkingUploadUrl({ objectPath, contentType });

    res.json({ dateFolder, filename, gsUri: toMilkingGsUri(objectPath), objectPath, uploadUrl });
  } catch (err) {
    next(err);
  }
}

async function importUpload(req, res, next) {
  try {
    const { objectPath } = req.body;
    const segment = '[A-Za-z0-9._-]{1,128}';
    if (!objectPath || !new RegExp(`^${segment}/${segment}/${segment}/${segment}$`).test(objectPath)) {
      return res.status(400).json({ error: 'objectPath is required and must be a <organizationId>/<facilityId>/<dateFolder>/<filename> path.' });
    }

    // bucketName is never taken from the client - there's only one
    // legitimate bucket for this feature, so it's hardcoded server-side
    // rather than trusted from the request. organizationId/facilityId come
    // from the caller's own session, not the request body, so a client
    // can never claim to be importing data on behalf of a different tenant.
    const result = await triggerMilkingImport({
      bucketName: config.milking.bucketName,
      objectPath,
      organizationId: req.scope.organizationId,
      facilityId: req.scope.facilityId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { generateUploadUrl, importUpload };
