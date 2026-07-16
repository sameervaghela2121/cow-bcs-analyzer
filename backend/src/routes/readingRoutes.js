const express = require('express');
const { requireAuth } = require('../middleware/auth');
const readingController = require('../controllers/readingController');
const { errorHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.post(
  '/',
  requireAuth(),
  (req, res, next) => {
    readingController.uploadMiddleware(req, res, (err) => {
      if (err) return errorHandler(err, req, res, next);
      next();
    });
  },
  readingController.create
);

router.get('/:id', requireAuth(), readingController.getOne);
router.get('/:id/media', requireAuth(), readingController.getMedia);

module.exports = router;
