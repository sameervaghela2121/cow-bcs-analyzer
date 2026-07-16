const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const cowRoutes = require('./cowRoutes');
const readingRoutes = require('./readingRoutes');
const reviewRoutes = require('./reviewRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/cows', cowRoutes);
router.use('/readings', readingRoutes);
router.use('/review', reviewRoutes);

module.exports = router;
