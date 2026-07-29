const Organization = require('../models/Organization');
const { slugify } = require('../utils/slugify');

// super_admin only (see routes) - the top of the drill-down nav:
// Organizations -> Facilities -> the regular app content.
async function list(_req, res, next) {
  try {
    const organizations = await Organization.find({}).sort({ name: 1 });
    res.json({
      organizations: organizations.map((o) => ({ id: o._id.toString(), name: o.name, slug: o.slug, status: o.status })),
    });
  } catch (err) {
    next(err);
  }
}

// Onboarding a new customer - super_admin only. A newly created org has no
// Facilities and no Org-Admin yet; both are separate follow-up steps
// (POST /api/facilities, then POST /api/users/invite with roleId set to
// the Org-Admin role and this organization's id).
async function create(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    const slug = slugify(name);
    if (!slug) {
      return res.status(400).json({ error: 'name must contain at least one letter or number.' });
    }
    const existing = await Organization.findOne({ slug });
    if (existing) {
      return res.status(409).json({ error: 'An organization with this name already exists.' });
    }
    const organization = await Organization.create({ name: name.trim(), slug, createdBy: req.user.id });
    res.status(201).json({
      organization: { id: organization._id.toString(), name: organization.name, slug: organization.slug, status: organization.status },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create };
