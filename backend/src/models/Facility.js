const mongoose = require('mongoose');

// A physical location under an Organization (e.g. "Modasa" under "Good
// Farm"). slug is unique WITHIN organization, not globally, so two
// different organizations can each have a "Ahmedabad" facility.
const facilitySchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'facilities' }
);

facilitySchema.index({ organization: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Facility', facilitySchema);
