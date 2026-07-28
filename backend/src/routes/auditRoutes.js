const express = require('express');
const { requireAuth, requireSession } = require('../middleware/auth');
const { resolveScope } = require('../middleware/resolveScope');
const auditController = require('../controllers/auditController');

const router = express.Router();

router.get('/', requireAuth(), requireSession(), resolveScope(), auditController.list);
router.get('/:id', requireAuth(), requireSession(), resolveScope(), auditController.getOne);

module.exports = router;
