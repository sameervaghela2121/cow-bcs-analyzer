const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

router.post('/invite', requireAuth(), requireRole('admin'), userController.invite);
router.get('/', requireAuth(), requireRole('admin'), userController.list);
router.patch('/:id/role', requireAuth(), requireRole('admin'), userController.updateRole);
router.delete('/:id', requireAuth(), requireRole('admin'), userController.remove);

module.exports = router;
