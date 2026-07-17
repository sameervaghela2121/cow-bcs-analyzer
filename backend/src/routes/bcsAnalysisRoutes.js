const express = require('express');
const { requireAuth } = require('../middleware/auth');
const bcsAnalysisController = require('../controllers/bcsAnalysisController');

const router = express.Router();

router.post('/upload-urls', requireAuth(), bcsAnalysisController.generateUploadUrls);
router.post('/', requireAuth(), bcsAnalysisController.create);
router.get('/:id', requireAuth(), bcsAnalysisController.getOne);
router.patch('/:id/approve', requireAuth(), bcsAnalysisController.approve);

module.exports = router;
