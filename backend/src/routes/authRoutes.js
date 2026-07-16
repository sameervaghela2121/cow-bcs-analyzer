const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/accept-invite', authController.acceptInvite);
router.post('/login', authController.login);

module.exports = router;
