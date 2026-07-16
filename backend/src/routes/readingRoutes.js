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

module.exports = router;
