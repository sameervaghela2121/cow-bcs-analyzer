const mongoose = require('mongoose');
const BcsAnalysis = require('../models/BcsAnalysis');
const { findOrCreateCow } = require('../services/cowService');
const { createAnalysis } = require('../services/bcsAnalysisService');
const {
  sanitizeBatchTimestamp,
  buildObjectPath,
  toGsUri,
  generateUploadUrl,
} = require('../services/gcsService');

function serializeBcsAnalysis(doc) {
  return {
    id: doc._id.toString(),
    cow: doc.cow.toString(),
    cowsId: doc.cowsId,
    cowsImages: doc.cowsImages,
    bcsScore: doc.bcsScore,
    status: doc.status,
    errorMessage: doc.errorMessage,
    createdBy: doc.createdBy.toString(),
    updatedBy: doc.updatedBy.toString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function generateUploadUrls(req, res, next) {
  try {
    const { cowsId, files } = req.body;
    if (!cowsId) return res.status(400).json({ error: 'cowsId is required.' });
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files must be a non-empty array of { filename, contentType }.' });
    }
    if (files.some((f) => !f || !f.filename || !f.contentType)) {
      return res.status(400).json({ error: 'Each file requires a filename and contentType.' });
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
    if (!cowsId) return res.status(400).json({ error: 'cowsId is required.' });
    if (!Array.isArray(cowsImages) || cowsImages.length === 0) {
      return res.status(400).json({ error: 'cowsImages must be a non-empty array of gs:// URIs.' });
    }
    if (cowsImages.some((uri) => typeof uri !== 'string' || !uri.startsWith('gs://'))) {
      return res.status(400).json({ error: 'Each entry in cowsImages must be a gs:// URI.' });
    }

    const analysis = await createAnalysis({ cowsId, cowsImages, userId: req.user.id });
    res.status(201).json({ bcsAnalysis: serializeBcsAnalysis(analysis) });
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
    res.json({ bcsAnalysis: serializeBcsAnalysis(analysis) });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateUploadUrls, create, getOne, serializeBcsAnalysis };
