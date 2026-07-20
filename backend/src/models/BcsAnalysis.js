const mongoose = require('mongoose');

const bcsAnalysisSchema = new mongoose.Schema(
  {
    cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true, index: true },
    cowsId: { type: String, required: true, trim: true, index: true },
    cowsImages: {
      type: [String],
      required: true,
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'At least one image is required.' },
    },
    bcsScore: { type: mongoose.Schema.Types.Mixed, default: {} },
    // A sibling of bcsScore, not nested inside it - the AI's own computed
    // average across whichever providers succeeded, never touched by any
    // reviewer action (approve/select/override all work off bcsScore's
    // median_bcs_score/provider breakdown instead).
    mean_bcs_score: { type: Number, default: null },
    status: { type: String, enum: ['not_started', 'processing', 'completed', 'failed'], default: 'not_started' },
    errorMessage: { type: String, default: null },
    is_approved: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'bcs_analysis' }
);

module.exports = mongoose.model('BcsAnalysis', bcsAnalysisSchema);
