const express = require('express');
const { requireAuth, requireSession } = require('../middleware/auth');
const { resolveScope } = require('../middleware/resolveScope');
const cowController = require('../controllers/cowController');

const router = express.Router();

router.post('/', requireAuth(), requireSession(), resolveScope(), cowController.create);
router.get('/', requireAuth(), requireSession(), resolveScope(), cowController.list);
router.get('/:cowsId/analyses', requireAuth(), requireSession(), resolveScope(), cowController.analyses);
router.get('/:cowsId', requireAuth(), requireSession(), resolveScope(), cowController.getOne);

module.exports = router;
