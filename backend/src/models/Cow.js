const mongoose = require('mongoose');

const cowSchema = new mongoose.Schema(
  {
    // cowsId is a farm-local tag, not a platform-wide identifier - two
    // different facilities legitimately both having a cow "1042" is normal,
    // so uniqueness is scoped to facility below, not global.
    cowsId: { type: String, required: true, trim: true },
    facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

cowSchema.index({ facility: 1, cowsId: 1 }, { unique: true });

module.exports = mongoose.model('Cow', cowSchema);
