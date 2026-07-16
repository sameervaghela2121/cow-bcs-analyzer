const mongoose = require('mongoose');

const providerResultSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    finalBcs: { type: Number, default: null },
    confidence: { type: String, default: null },
    status: { type: String, required: true },
    errorMessage: { type: String, default: null },
  },
  { _id: false }
);

const readingSchema = new mongoose.Schema(
  {
    cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true, index: true },
    media: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true },
    status: { type: String, enum: ['processing', 'scored', 'failed'], default: 'processing' },
    score: { type: Number, default: null },
    confidence: { type: String, enum: ['high', 'medium', 'low', null], default: null },
    band: { type: String, enum: ['thin', 'ideal', 'heavy', null], default: null },
    flagged: { type: Boolean, default: false },
    flagReason: { type: String, default: null },
    reviewStatus: { type: String, enum: ['not_required', 'pending', 'approved', 'overridden'], default: 'not_required' },
    spread: { type: Number, default: null },
    providerResults: { type: [providerResultSchema], default: [] },
    errorMessage: { type: String, default: null },
    capturedAt: { type: Date, required: true, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reading', readingSchema);
