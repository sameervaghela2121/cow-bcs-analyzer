const mongoose = require('mongoose');

// Deployed with --source=. (this directory only), so this is a duplicate of
// backend/src/models/CowGroup.js kept in sync by hand - the two packages
// can't share code across the deploy boundary.
//
// A named group/pen a cow currently sits in (e.g. "2.1", "3.3" as seen in
// real milking exports). Scoped to facility, mirroring Cow.js. Group
// membership isn't tracked here as a mutable field on Cow; instead each
// MilkingRecord references whichever CowGroup was resolved at import time
// (see importHandler.js), so a cow's group history is simply the trail of
// CowGroup refs on its past records - moving a cow to a new group never
// rewrites history.
const cowGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
  },
  { timestamps: true, collection: 'cow_groups' }
);

cowGroupSchema.index({ facility: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('CowGroup', cowGroupSchema);
