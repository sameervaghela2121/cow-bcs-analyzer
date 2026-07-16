const mongoose = require('mongoose');

const cowSchema = new mongoose.Schema(
  {
    cowId: { type: String, required: true, unique: true, trim: true },
    breed: { type: String, default: 'Unknown' },
    lactation: { type: String, default: 'Unknown' },
    pen: { type: String, default: 'Unassigned' },
    latestScore: { type: Number, default: null },
    latestBand: { type: String, enum: ['thin', 'ideal', 'heavy', null], default: null },
    latestConfidence: { type: String, enum: ['high', 'medium', 'low', null], default: null },
    lastScoredAt: { type: Date, default: null },
    flagged: { type: Boolean, default: false },
    sharpDrop: { type: Boolean, default: false },
    dropAmount: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cow', cowSchema);
