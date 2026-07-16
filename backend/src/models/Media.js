const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', mediaSchema);
