const express = require('express');
const { requireAuth } = require('../middleware/auth');
const auditController = require('../controllers/auditController');

const router = express.Router();

router.get('/', requireAuth(), auditController.list);
router.get('/:id', requireAuth(), auditController.getOne);

module.exports = router;
