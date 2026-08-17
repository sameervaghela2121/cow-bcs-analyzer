const express = require('express');
const { requireAuth, requireSession } = require('../middleware/auth');
const { resolveScope } = require('../middleware/resolveScope');
const cowGroupController = require('../controllers/cowGroupController');

const router = express.Router();

router.get('/', requireAuth(), requireSession(), resolveScope(), cowGroupController.list);

module.exports = router;
