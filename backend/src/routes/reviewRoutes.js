const express = require('express');
const { requireAuth } = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

const router = express.Router();

router.get('/queue', requireAuth(), reviewController.queue);
router.post('/:readingId/approve', requireAuth(), reviewController.approve);
router.post('/:readingId/override', requireAuth(), reviewController.override);

module.exports = router;
