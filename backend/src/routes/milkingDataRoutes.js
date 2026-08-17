const express = require('express');
const { requireAuth, requireSession } = require('../middleware/auth');
const { resolveScope } = require('../middleware/resolveScope');
const milkingDataController = require('../controllers/milkingDataController');

const router = express.Router();

router.post('/upload-url', requireAuth(), requireSession(), resolveScope(), milkingDataController.generateUploadUrl);
router.post('/import', requireAuth(), requireSession(), resolveScope(), milkingDataController.importUpload);
router.get('/summary', requireAuth(), requireSession(), resolveScope(), milkingDataController.summary);

module.exports = router;
