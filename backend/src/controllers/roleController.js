const Role = require('../models/Role');

// Every platform-default role (organization: null, seeded once - "Org
// Admin"/"Facility-Admin"/"Staff") plus any custom roles this specific
// organization has defined for itself. v1 only ever seeds the defaults;
// custom-role creation is future work, but the query already supports it.
async function list(req, res, next) {
  try {
    const roles = await Role.find({ $or: [{ organization: null }, { organization: req.user.organizationId }] }).sort({ name: 1 });
    res.json({ roles: roles.map((r) => ({ id: r._id.toString(), name: r.name, permissions: r.permissions })) });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
