const multer = require('multer');
const { createProcessingReading } = require('../services/readingService');
const { processReading } = require('../jobs/processReading');

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

module.exports = { create, uploadMiddleware: upload.single('file') };
