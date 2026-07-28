const express = require('express');
const { requireAuth, requireSession } = require('../middleware/auth');
const roleController = require('../controllers/roleController');

const router = express.Router();

router.get('/', requireAuth(), requireSession(), roleController.list);

module.exports = router;
