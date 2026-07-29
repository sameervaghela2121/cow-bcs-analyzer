const express = require('express');
const { requireAuth, requireSession, requireSuperAdmin } = require('../middleware/auth');
const facilityController = require('../controllers/facilityController');

const router = express.Router();

router.get('/', requireAuth(), requireSession(), facilityController.list);
// Facility setup is the platform admin's job, same as creating the
// organization itself - an Org-Admin only ever picks among facilities
// super_admin has already set up, never creates one.
router.post('/', requireAuth(), requireSession(), requireSuperAdmin(), facilityController.create);

module.exports = router;
