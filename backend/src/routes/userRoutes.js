const express = require('express');
const { requireAuth, requireSession, requireRole } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

// Direct successor of the old requireRole('admin') gate, translated to the
// membership model - both 'Org-Admin' (whole organization) and 'Facility
// Admin' (their own facility only, enforced in userController/userService)
// can manage their team; super_admin passes every requireRole() check
// automatically.
router.post('/invite', requireAuth(), requireSession(), requireRole('Org-Admin', 'Facility-Admin'), userController.invite);
router.get('/', requireAuth(), requireSession(), requireRole('Org-Admin', 'Facility-Admin'), userController.list);
router.patch('/:id/role', requireAuth(), requireSession(), requireRole('Org-Admin', 'Facility-Admin'), userController.updateRole);
router.delete('/:id', requireAuth(), requireSession(), requireRole('Org-Admin', 'Facility-Admin'), userController.remove);

module.exports = router;
