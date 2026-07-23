const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const cowRoutes = require('./cowRoutes');
const bcsAnalysisRoutes = require('./bcsAnalysisRoutes');
const auditRoutes = require('./auditRoutes');
const milkingDataRoutes = require('./milkingDataRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/cows', cowRoutes);
router.use('/bcs-analysis', bcsAnalysisRoutes);
router.use('/audit', auditRoutes);
router.use('/milking-data', milkingDataRoutes);

module.exports = router;
