const express = require('express');
const { requireAuth } = require('../middleware/auth');
const cowController = require('../controllers/cowController');

const router = express.Router();

router.post('/', requireAuth(), cowController.create);
router.get('/', requireAuth(), cowController.list);
router.get('/:cowId/readings', requireAuth(), cowController.readings);
router.get('/:cowId', requireAuth(), cowController.getOne);
router.patch('/:cowId', requireAuth(), cowController.update);

module.exports = router;
