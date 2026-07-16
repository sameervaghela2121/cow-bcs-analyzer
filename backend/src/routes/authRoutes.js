const express = require('express');
const { requireAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/accept-invite', authController.acceptInvite);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', requireAuth(), authController.logout);

module.exports = router;
