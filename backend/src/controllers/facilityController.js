const Facility = require('../models/Facility');
const { slugify } = require('../utils/slugify');

// super_admin can list any organization's facilities (drilling down from
// the Organizations page); Org-Admin can only list their own organization's
// (this is their landing page - org is already fixed for them, so
// organizationId isn't even required from them, just ignored if sent).
async function list(req, res, next) {
  try {
    const organizationId = req.user.isSuperAdmin ? req.query.organizationId : req.user.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required.' });
    }
    const facilities = await Facility.find({ organization: organizationId }).sort({ name: 1 });
    res.json({
      facilities: facilities.map((f) => ({ id: f._id.toString(), name: f.name, slug: f.slug, status: f.status })),
    });
  } catch (err) {
    next(err);
  }
}

// super_admin-only (see facilityRoutes.js) - facility setup is the platform
// admin's job, same as creating the organization itself.
async function create(req, res, next) {
  try {
    const { organizationId } = req.body;
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required.' });
    }
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    const slug = slugify(name);
    if (!slug) {
      return res.status(400).json({ error: 'name must contain at least one letter or number.' });
    }
    const existing = await Facility.findOne({ organization: organizationId, slug });
    if (existing) {
      return res.status(409).json({ error: 'A facility with this name already exists in this organization.' });
    }
    const facility = await Facility.create({ organization: organizationId, name: name.trim(), slug, createdBy: req.user.id });
    res.status(201).json({
      facility: { id: facility._id.toString(), name: facility.name, slug: facility.slug, status: facility.status },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create };
