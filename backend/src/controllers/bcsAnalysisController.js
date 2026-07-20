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
const { triggerCompression } = require('../services/imageCompressorClient');
const { THUMBNAIL, DISPLAY, buildVariantObjectPath } = require('../services/imageVariants');
const { snapshotBcsAnalysis, recordAuditEntry } = require('../services/auditService');
const { PROVIDERS, roundQuarter, successfulScores, meanOfScores, medianOfScores } = require('../services/bcsScoring');
const config = require('../config/env');

const SAFE_ID_OR_FILENAME = /^[A-Za-z0-9._-]{1,128}$/;
const ALLOWED_IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const SELECTABLE_SOURCES = [...PROVIDERS, 'mean', 'median'];

// The value each of the 5 selectable candidates currently holds - null for
// a provider that never returned a successful score. Mean/median are
// computed fresh here (never stored), same helpers the serializer uses.
function candidateValues(bcsScore) {
  const scores = successfulScores(bcsScore);
  const values = { mean: meanOfScores(scores), median: medianOfScores(scores) };
  for (const p of PROVIDERS) {
    values[p] = bcsScore?.[p]?.status === 'success' ? bcsScore[p].final_bcs : null;
  }
  return values;
}

// Sets every candidate's is_true flag based on whether its value exactly
// equals `matchValue` (already quarter-rounded on both sides, so exact ===
// is safe) - so a single pick can mark several candidates true at once
// purely because they happen to agree. `matchValue: null` (Override) always
// clears every flag to false, since a manually typed value isn't matched
// against anything.
function applySelection(bcsScore, values, matchValue) {
  const next = { ...(bcsScore || {}) };
  for (const p of PROVIDERS) {
    if (next[p]) {
      next[p] = { ...next[p], is_true: matchValue != null && values[p] === matchValue };
    }
  }
  next.is_mean_true = matchValue != null && values.mean === matchValue;
  next.is_median_true = matchValue != null && values.median === matchValue;
  return next;
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
// thumbnailUrls/displayUrls point at compressed variants the image-compressor
// writes alongside each original - their paths are derived here, not stored,
// the same way imageUrls always has been. Signing doesn't check existence, so
// these resolve even if compression hasn't finished yet (or failed); the
// frontend falls back to imageUrls (the original) on a 404.
async function serializeBcsAnalysis(doc) {
  const objectPaths = doc.cowsImages.map((uri) => fromGsUri(uri).objectPath);
  const [imageUrls, thumbnailUrls, displayUrls] = await Promise.all([
    Promise.all(objectPaths.map((objectPath) => generateReadUrl({ objectPath }))),
    Promise.all(
      objectPaths.map((objectPath) =>
        generateReadUrl({ objectPath: buildVariantObjectPath(objectPath, THUMBNAIL.name) })
      )
    ),
    Promise.all(
      objectPaths.map((objectPath) =>
        generateReadUrl({ objectPath: buildVariantObjectPath(objectPath, DISPLAY.name) })
      )
    ),
  ]);
  // meanScore/medianScore are computed fresh on every read, never stored -
  // a pure function of whichever providers succeeded, so there's nothing
  // here that can drift from the raw scores it's derived from.
  const scores = successfulScores(doc.bcsScore);
  return {
    id: doc._id.toString(),
    cow: doc.cow.toString(),
    cowsId: doc.cowsId,
    cowsImages: doc.cowsImages,
    imageUrls,
    thumbnailUrls,
    displayUrls,
    bcsScore: doc.bcsScore,
    meanScore: meanOfScores(scores),
    medianScore: medianOfScores(scores),
    final_bcs: doc.final_bcs,
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

    // Compressed thumbnail/display variants are a display-only optimization -
    // a failure here must never block record creation or AI analysis, which
    // both continue to work off the original, full-quality image.
    await Promise.all(
      cowsImages.map(async (uri) => {
        try {
          await triggerCompression({ bucketName: config.gcs.bucketName, objectPath: fromGsUri(uri).objectPath });
        } catch (compressionErr) {
          console.error(`image-compressor failed for ${uri}:`, compressionErr);
        }
      })
    );

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

// Reviewer clicks exactly one of the 5 candidates (3 providers + computed
// mean + computed median). Every candidate whose value exactly matches that
// pick is marked is_true too - so picking Median, which happens to equal
// Gemini's own score, marks both true in one click. final_bcs becomes the
// clicked value directly; no combining math ever runs across differing
// values (there's nothing to select if they disagree - that's what Override
// is for). This also covers what used to be a separate Approve action:
// clicking Median (auto-matching any provider that agrees with it) and
// saving is a strict superset of "accept the median as-is."
async function selectScore(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'BCS analysis record not found.' });
    }
    const { source } = req.body;
    if (!SELECTABLE_SOURCES.includes(source)) {
      return res.status(400).json({ error: `source must be one of: ${SELECTABLE_SOURCES.join(', ')}.` });
    }

    const analysis = await BcsAnalysis.findById(id);
    if (!analysis) return res.status(404).json({ error: 'BCS analysis record not found.' });
    if (analysis.status !== 'completed') {
      return res.status(409).json({ error: 'Only a completed analysis can be reviewed.' });
    }

    const values = candidateValues(analysis.bcsScore);
    const clickedValue = values[source];
    if (clickedValue == null) {
      return res.status(400).json({ error: `'${source}' has no successful score to select.` });
    }

    const before = snapshotBcsAnalysis(analysis);

    analysis.bcsScore = applySelection(analysis.bcsScore, values, clickedValue);
    analysis.markModified('bcsScore'); // Mixed type - be explicit rather than rely on assignment detection
    analysis.final_bcs = clickedValue;
    analysis.is_approved = true;
    analysis.updatedBy = req.user.id;
    await analysis.save();
    const after = snapshotBcsAnalysis(analysis);

    // Audit trail write is best-effort, same fault-tolerance philosophy as
    // image compression - a logging failure must never undo or block a
    // review decision that has already persisted successfully.
    try {
      await recordAuditEntry({ analysis, action: 'provider_selected', before, after, performedBy: req.user.id });
    } catch (auditErr) {
      console.error(`audit log write failed for bcs_analysis ${analysis._id} (select):`, auditErr);
    }

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

    const before = snapshotBcsAnalysis(analysis);

    // A manual override is a fully custom value, typed by the reviewer, not
    // computed from anything - it isn't matched against the candidates at
    // all, so every flag clears to false (matchValue: null short-circuits
    // applySelection's comparisons).
    analysis.bcsScore = applySelection(analysis.bcsScore, {}, null);
    analysis.markModified('bcsScore'); // Mixed type - be explicit rather than rely on assignment detection
    analysis.final_bcs = roundQuarter(score);
    // Overriding is itself a review decision - a reviewer picking the value
    // by hand is at least as final as accepting a matched candidate, so
    // this counts as reviewed too and drops off the review list the same way.
    analysis.is_approved = true;
    analysis.updatedBy = req.user.id;
    await analysis.save();
    const after = snapshotBcsAnalysis(analysis);

    try {
      await recordAuditEntry({ analysis, action: 'overridden', before, after, performedBy: req.user.id });
    } catch (auditErr) {
      console.error(`audit log write failed for bcs_analysis ${analysis._id} (override):`, auditErr);
    }

    res.json({ bcsAnalysis: await serializeBcsAnalysis(analysis) });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateUploadUrls, create, getOne, selectScore, override, serializeBcsAnalysis };
