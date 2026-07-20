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
    // bcsScore holds the raw per-provider results (claude/gemini/openai,
    // each with is_true) plus is_mean_true/is_median_true/is_critical - no
    // mean or median value is stored here, since both are a pure function
    // of the providers' final_bcs and are computed fresh wherever needed
    // (see services/bcsScoring.js) rather than persisted.
    bcsScore: { type: mongoose.Schema.Types.Mixed, default: {} },
    // The single source of truth for "what is this analysis's score" - null
    // until a reviewer acts (selecting a matched candidate, or overriding),
    // at which point every other page reads this one field instead of
    // re-deriving anything.
    final_bcs: { type: Number, default: null },
    status: { type: String, enum: ['not_started', 'processing', 'completed', 'failed'], default: 'not_started' },
    errorMessage: { type: String, default: null },
    is_approved: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'bcs_analysis' }
);

module.exports = mongoose.model('BcsAnalysis', bcsAnalysisSchema);
