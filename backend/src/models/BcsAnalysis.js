const mongoose = require('mongoose');

const bcsAnalysisSchema = new mongoose.Schema(
  {
    // The Cow document is the source of truth for cowsId - it's looked up
    // via this reference (populate('cow')) rather than denormalized onto
    // this document, so there's only ever one place a cow's id can drift.
    cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true, index: true },
    // Denormalized (unlike cowsId above) because these are query filters
    // needed on every tenant-scoped list/dashboard endpoint, not a display
    // label read once via populate - and they're fixed forever at creation,
    // so there's no drift risk the way a mutable display string would have.
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
    cowsImages: {
      type: [String],
      required: true,
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'At least one image is required.' },
    },
    // bcsScore holds the raw per-provider results (claude/gemini/openai,
    // each with isTrue) plus isMeanAccurate/isMedianAccurate/isCritical - no
    // mean or median value is stored here, since both are a pure function
    // of the providers' finalBcs and are computed fresh wherever needed
    // (see services/bcsScoring.js) rather than persisted.
    bcsScore: { type: mongoose.Schema.Types.Mixed, default: {} },
    // The single source of truth for "what is this analysis's score" - null
    // until a reviewer acts (selecting a matched candidate, or overriding),
    // at which point every other page reads this one field instead of
    // re-deriving anything.
    finalBcs: { type: Number, default: null },
    status: { type: String, enum: ['not_started', 'processing', 'completed', 'failed'], default: 'not_started' },
    errorMessage: { type: String, default: null },
    isApproved: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'bcs_analysis' }
);

// Reviewer worklist: pending analyses at a facility, most recent first.
bcsAnalysisSchema.index({ facility: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('BcsAnalysis', bcsAnalysisSchema);
