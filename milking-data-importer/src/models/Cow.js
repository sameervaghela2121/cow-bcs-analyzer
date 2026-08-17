const mongoose = require('mongoose');

// Deployed with --source=. (this directory only), so this is a duplicate of
// backend/src/models/Cow.js kept in sync by hand - the two packages can't
// share code across the deploy boundary.
//
// cowsId is a farm-local tag, not a platform-wide identifier - two
// different facilities legitimately both having a cow "1042" is normal, so
// uniqueness is scoped to facility below, not global.
const cowSchema = new mongoose.Schema(
  {
    cowsId: { type: String, required: true, trim: true },
    facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

cowSchema.index({ facility: 1, cowsId: 1 }, { unique: true });

module.exports = mongoose.model('Cow', cowSchema);
