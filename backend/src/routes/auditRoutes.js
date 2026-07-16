const express = require('express');
const { requireAuth } = require('../middleware/auth');
const auditController = require('../controllers/auditController');

const router = express.Router();

router.get('/', requireAuth(), auditController.list);

module.exports = router;
