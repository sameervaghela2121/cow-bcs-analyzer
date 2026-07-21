const mongoose = require('mongoose');

const cowSchema = new mongoose.Schema(
  {
    cowsId: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cow', cowSchema);
