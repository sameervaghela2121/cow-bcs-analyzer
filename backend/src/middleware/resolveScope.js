const Facility = require('../models/Facility');

// Computes which organization/facility a request is actually acting
// against, since that isn't always a fixed fact about the caller anymore:
//
// - super_admin has no fixed scope at all - it must be supplied explicitly
//   (via the Organizations -> Facilities drill-down UI), trusted as-is
//   since they're allowed to view anything.
// - An "Org-Admin" membership (facility: null) is fixed to one organization
//   but not one facility - facilityId must be supplied (via the Facilities
//   picker) and is verified to actually belong to their own organization.
// - Facility-Admin / Staff are fixed to exactly one facility already (their
//   own membership) - any override is ignored, there's nothing to pick.
//
// Sets req.scope = { organizationId, facilityId }; every controller reads
// from here instead of req.user.organizationId/facilityId directly.
function resolveScope() {
  return async function (req, res, next) {
    try {
      if (req.user.isSuperAdmin) {
        const { organizationId, facilityId } = req.query;
        if (!organizationId || !facilityId) {
          return res.status(400).json({ error: 'organizationId and facilityId are required.' });
        }
        req.scope = { organizationId, facilityId };
        return next();
      }

      if (req.user.roleName === 'Org-Admin') {
        const { facilityId } = req.query;
        if (!facilityId) {
          return res.status(400).json({ error: 'facilityId is required.' });
        }
        const facility = await Facility.findOne({ _id: facilityId, organization: req.user.organizationId });
        if (!facility) {
          return res.status(403).json({ error: 'That facility does not belong to your organization.' });
        }
        req.scope = { organizationId: req.user.organizationId, facilityId };
        return next();
      }

      req.scope = { organizationId: req.user.organizationId, facilityId: req.user.facilityId };
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { resolveScope };
