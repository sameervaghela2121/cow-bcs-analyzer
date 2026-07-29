const express = require('express');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const organizationController = require('../controllers/organizationController');

const router = express.Router();

router.get('/', requireAuth(), requireSuperAdmin(), organizationController.list);
router.post('/', requireAuth(), requireSuperAdmin(), organizationController.create);

module.exports = router;
