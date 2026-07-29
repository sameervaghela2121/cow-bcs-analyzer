const mongoose = require('mongoose');

// Top of the tenant hierarchy: Organization -> Facility -> Cow/BcsAnalysis/etc.
// Ownership ("who administers this org") is deliberately not a stored field
// here - it's derived via Membership.find({ organization, facility: null,
// role: <Org-Admin> }), the same anti-denormalization stance BcsAnalysis
// already takes with cowsId (resolved via populate('cow') rather than
// stored directly).
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'organizations' }
);

module.exports = mongoose.model('Organization', organizationSchema);
