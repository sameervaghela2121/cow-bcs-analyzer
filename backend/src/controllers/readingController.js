const multer = require('multer');
const { createProcessingReading } = require('../services/readingService');
const { processReading } = require('../jobs/processReading');
const Reading = require('../models/Reading');
const Media = require('../models/Media');
const Cow = require('../models/Cow');
const { absolutePath } = require('../services/storageService');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(Object.assign(new Error(`Unsupported file type '${file.mimetype}'. Allowed: ${ALLOWED_TYPES.join(', ')}`), { status: 400 }));
    }
    cb(null, true);
  },
});

function serializeReading(reading, cow) {
  return {
    id: reading._id.toString(),
    cowId: cow.cowId,
    status: reading.status,
    score: reading.score,
    confidence: reading.confidence,
    band: reading.band,
    flagged: reading.flagged,
    flagReason: reading.flagReason,
    reviewStatus: reading.reviewStatus,
    spread: reading.spread,
    providerResults: reading.providerResults,
    errorMessage: reading.errorMessage,
    capturedAt: reading.capturedAt,
  };
}

async function create(req, res, next) {
  try {
    const { cowId } = req.body;
    if (!cowId || !cowId.trim()) {
      return res.status(400).json({ error: 'cowId is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'A file is required.' });
    }
    const reading = await createProcessingReading({
      cowId: cowId.trim(),
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      createdBy: req.user.id,
    });
    processReading(reading._id.toString());
    res.status(202).json({ readingId: reading._id.toString(), status: reading.status });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const reading = await Reading.findById(req.params.id);
    if (!reading) return res.status(404).json({ error: 'Reading not found.' });
    const cow = await Cow.findById(reading.cow);
    res.json({ reading: serializeReading(reading, cow) });
  } catch (err) {
    next(err);
  }
}

async function getMedia(req, res, next) {
  try {
    const reading = await Reading.findById(req.params.id);
    if (!reading) return res.status(404).json({ error: 'Reading not found.' });
    const media = await Media.findById(reading.media);
    if (!media) return res.status(404).json({ error: 'Media not found.' });
    res.setHeader('Content-Type', media.mimeType);
    res.sendFile(absolutePath(media.storageKey));
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, getMedia, uploadMiddleware: upload.single('file'), serializeReading };
