const mongoose = require('mongoose');

// Duplicate of backend/src/models/Cow.js kept in sync by hand - the Cloud
// Function is deployed with --source=. and can't require across the
// package boundary. Same 'cows' collection, resolved by facility+cowsId.
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
