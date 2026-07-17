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
    status: { type: String, enum: ['not_started', 'processing', 'completed', 'failed'], default: 'not_started' },
    errorMessage: { type: String, default: null },
    is_approved: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'bcs_analysis' }
);

module.exports = mongoose.model('BcsAnalysis', bcsAnalysisSchema);
