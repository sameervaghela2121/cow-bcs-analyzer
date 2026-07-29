const express = require('express');
const { requireAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/accept-invite', authController.acceptInvite);
router.post('/login', authController.login);
router.post('/logout', requireAuth(), authController.logout);
router.get('/me', requireAuth(), authController.me);
router.get('/memberships', requireAuth(), authController.listMemberships);
router.post('/select-membership', requireAuth(), authController.selectMembership);

module.exports = router;
