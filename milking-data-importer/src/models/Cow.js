const mongoose = require('mongoose');

// Duplicate of backend/src/models/Cow.js kept in sync by hand - the Cloud
// Function is deployed with --source=. and can't require across the
// package boundary. Same 'cows' collection, resolved by cowsId.
const cowSchema = new mongoose.Schema(
  {
    cowsId: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cow', cowSchema);
