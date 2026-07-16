const express = require('express');
const { requireAuth } = require('../middleware/auth');
const cowController = require('../controllers/cowController');

const router = express.Router();

router.post('/', requireAuth(), cowController.create);
router.get('/:cowId', requireAuth(), cowController.getOne);
router.patch('/:cowId', requireAuth(), cowController.update);

module.exports = router;
