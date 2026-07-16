const express = require('express');
const { requireAuth } = require('../middleware/auth');
const cowController = require('../controllers/cowController');

const router = express.Router();

router.post('/', requireAuth(), cowController.create);
router.get('/', requireAuth(), cowController.list);
router.get('/:cowsId/analyses', requireAuth(), cowController.analyses);
router.get('/:cowsId', requireAuth(), cowController.getOne);

module.exports = router;
