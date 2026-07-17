const mongoose = require('mongoose');
const BcsAnalysis = require('../models/BcsAnalysis');
const { findOrCreateCow } = require('../services/cowService');
const { createAnalysis } = require('../services/bcsAnalysisService');
const {
  sanitizeBatchTimestamp,
  buildObjectPath,
  toGsUri,
  fromGsUri,
  generateUploadUrl,
  generateReadUrl,
} = require('../services/gcsService');
const config = require('../config/env');

const SAFE_ID_OR_FILENAME = /^[A-Za-z0-9._-]{1,128}$/;
const ALLOWED_IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// BCS scores are always quarter-point increments everywhere else in this
// system (ai-backend rounds every provider's final_bcs and the mean the
// same way) - a manual override must land on the same scale.
function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

// Every cowsImages entry must be a gs:// URI in *our* bucket, under a
// <cowsId>/<batchTimestamp>/<filename> path that actually matches the cowsId
// being submitted — otherwise a caller could reference another cow's images,
// or an entirely different bucket, without ever uploading anything themselves.
function isOwnedImageUri(uri, cowsId) {
  if (typeof uri !== 'string' || !uri.startsWith(`gs://${config.gcs.bucketName}/`)) return false;
  const { objectPath } = fromGsUri(uri);
  const segments = objectPath.split('/');
  if (segments.length !== 3) return false;
  const [imageCowsId, batchTimestamp, filename] = segments;
  return (
    imageCowsId === cowsId &&
    SAFE_ID_OR_FILENAME.test(batchTimestamp) &&
    SAFE_ID_OR_FILENAME.test(filename)
  );
}

// Short-lived signed GET URLs so the frontend can render the images directly
// (cowsImages itself is just gs:// object paths, not browser-fetchable).
async function serializeBcsAnalysis(doc) {
  const imageUrls = await Promise.all(
    doc.cowsImages.map((uri) => generateReadUrl({ objectPath: fromGsUri(uri).objectPath }))
  );
  return {
    id: doc._id.toString(),
    cow: doc.cow.toString(),
    cowsId: doc.cowsId,
    cowsImages: doc.cowsImages,
    imageUrls,
    bcsScore: doc.bcsScore,
    status: doc.status,
    errorMessage: doc.errorMessage,
    is_approved: doc.is_approved,
    createdBy: doc.createdBy.toString(),
    updatedBy: doc.updatedBy.toString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function generateUploadUrls(req, res, next) {
  try {
    const { cowsId, files } = req.body;
    if (!cowsId || !SAFE_ID_OR_FILENAME.test(cowsId)) {
      return res.status(400).json({ error: 'cowsId is required and may only contain letters, numbers, \'.\', \'_\', \'-\'.' });
    }
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files must be a non-empty array of { filename, contentType }.' });
    }
    if (files.some((f) => !f || !f.filename || !f.contentType)) {
      return res.status(400).json({ error: 'Each file requires a filename and contentType.' });
    }
    if (files.some((f) => !SAFE_ID_OR_FILENAME.test(f.filename))) {
      return res.status(400).json({ error: 'filename may only contain letters, numbers, \'.\', \'_\', \'-\'.' });
    }
    if (files.some((f) => !ALLOWED_IMAGE_CONTENT_TYPES.has(f.contentType))) {
      return res.status(400).json({ error: `contentType must be one of: ${[...ALLOWED_IMAGE_CONTENT_TYPES].join(', ')}.` });
    }

    await findOrCreateCow(cowsId);

    const batchTimestamp = sanitizeBatchTimestamp();
    const uploads = await Promise.all(
      files.map(async ({ filename, contentType }) => {
        const objectPath = buildObjectPath({ cowsId, batchTimestamp, filename });
        const uploadUrl = await generateUploadUrl({ objectPath, contentType });
        return { filename, gsUri: toGsUri(objectPath), uploadUrl };
      })
    );

    res.json({ cowsId, batchTimestamp, uploads });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { cowsId, cowsImages } = req.body;
    if (!cowsId || !SAFE_ID_OR_FILENAME.test(cowsId)) {
      return res.status(400).json({ error: 'cowsId is required and may only contain letters, numbers, \'.\', \'_\', \'-\'.' });
    }
    if (!Array.isArray(cowsImages) || cowsImages.length === 0) {
      return res.status(400).json({ error: 'cowsImages must be a non-empty array of gs:// URIs.' });
    }
    if (cowsImages.some((uri) => !isOwnedImageUri(uri, cowsId))) {
      return res.status(400).json({
        error: `Each entry in cowsImages must be a gs://${config.gcs.bucketName}/${cowsId}/<batchTimestamp>/<filename> URI.`,
      });
    }

    const analysis = await createAnalysis({ cowsId, cowsImages, userId: req.user.id });
    res.status(201).json({ bcsAnalysis: await serializeBcsAnalysis(analysis) });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'BCS analysis record not found.' });
    }
    const analysis = await BcsAnalysis.findById(id);
    if (!analysis) return res.status(404).json({ error: 'BCS analysis record not found.' });
    res.json({ bcsAnalysis: await serializeBcsAnalysis(analysis) });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'BCS analysis record not found.' });
    }
    const analysis = await BcsAnalysis.findById(id);
    if (!analysis) return res.status(404).json({ error: 'BCS analysis record not found.' });
    if (analysis.status !== 'completed') {
      return res.status(409).json({ error: 'Only a completed analysis can be approved.' });
    }

    analysis.is_approved = true;
    analysis.updatedBy = req.user.id;
    await analysis.save();

    res.json({ bcsAnalysis: await serializeBcsAnalysis(analysis) });
  } catch (err) {
    next(err);
  }
}

async function override(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'BCS analysis record not found.' });
    }
    const { score } = req.body;
    if (typeof score !== 'number' || Number.isNaN(score) || score < 1 || score > 5) {
      return res.status(400).json({ error: 'score is required and must be a number between 1 and 5.' });
    }

    const analysis = await BcsAnalysis.findById(id);
    if (!analysis) return res.status(404).json({ error: 'BCS analysis record not found.' });
    if (analysis.status !== 'completed') {
      return res.status(409).json({ error: 'Only a completed analysis can be overridden.' });
    }

    // Only mean_bcs_score changes - the per-provider breakdown (claude/
    // gemini/openai) already recorded stays intact for audit purposes.
    analysis.bcsScore = { ...analysis.bcsScore, mean_bcs_score: roundQuarter(score) };
    analysis.markModified('bcsScore'); // Mixed type - be explicit rather than rely on assignment detection
    // Overriding is itself a review decision - a reviewer picking the value
    // by hand is at least as final as approving the mean as-is, so this
    // counts as reviewed too and drops off the review list the same way.
    analysis.is_approved = true;
    analysis.updatedBy = req.user.id;
    await analysis.save();

    res.json({ bcsAnalysis: await serializeBcsAnalysis(analysis) });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateUploadUrls, create, getOne, approve, override, serializeBcsAnalysis };
