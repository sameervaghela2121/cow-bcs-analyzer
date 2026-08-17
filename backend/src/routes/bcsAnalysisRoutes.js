const express = require('express');
const { requireAuth, requireSession } = require('../middleware/auth');
const { resolveScope } = require('../middleware/resolveScope');
const bcsAnalysisController = require('../controllers/bcsAnalysisController');

const router = express.Router();

router.post('/upload-urls', requireAuth(), requireSession(), resolveScope(), bcsAnalysisController.generateUploadUrls);
router.post('/', requireAuth(), requireSession(), resolveScope(), bcsAnalysisController.create);
// Must precede /:id - otherwise Express would try to match "dashboard-summary" as an :id param.
router.get('/dashboard-summary', requireAuth(), requireSession(), resolveScope(), bcsAnalysisController.dashboardSummary);
router.get('/:id', requireAuth(), requireSession(), resolveScope(), bcsAnalysisController.getOne);
router.patch('/:id/select', requireAuth(), requireSession(), resolveScope(), bcsAnalysisController.selectScore);
router.patch('/:id/override', requireAuth(), requireSession(), resolveScope(), bcsAnalysisController.override);

module.exports = router;
