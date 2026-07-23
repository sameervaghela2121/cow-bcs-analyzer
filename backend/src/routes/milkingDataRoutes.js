const express = require('express');
const { requireAuth } = require('../middleware/auth');
const milkingDataController = require('../controllers/milkingDataController');

const router = express.Router();

router.post('/upload-url', requireAuth(), milkingDataController.generateUploadUrl);
router.post('/import', requireAuth(), milkingDataController.importUpload);

module.exports = router;
