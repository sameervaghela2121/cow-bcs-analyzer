const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const cowRoutes = require('./cowRoutes');
const bcsAnalysisRoutes = require('./bcsAnalysisRoutes');
const auditRoutes = require('./auditRoutes');
const milkingDataRoutes = require('./milkingDataRoutes');
const roleRoutes = require('./roleRoutes');
const organizationRoutes = require('./organizationRoutes');
const facilityRoutes = require('./facilityRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/cows', cowRoutes);
router.use('/bcs-analysis', bcsAnalysisRoutes);
router.use('/audit', auditRoutes);
router.use('/milking-data', milkingDataRoutes);
router.use('/roles', roleRoutes);
router.use('/organizations', organizationRoutes);
router.use('/facilities', facilityRoutes);

module.exports = router;
