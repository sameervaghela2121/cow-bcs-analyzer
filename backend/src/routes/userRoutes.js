const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

router.post('/invite', requireAuth(), requireRole('admin'), userController.invite);

module.exports = router;
