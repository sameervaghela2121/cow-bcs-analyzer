const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    bcsAnalysis: { type: mongoose.Schema.Types.ObjectId, ref: 'BcsAnalysis', required: true, index: true },
    cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true, index: true },
    cowsId: { type: String, required: true, trim: true, index: true },
    // 'approved' (plain accept-the-median-as-is) no longer exists as its own
    // action - selecting the Median candidate (which auto-matches any
    // provider that agrees with it) and saving is a strict superset of what
    // it used to do, recorded as 'provider_selected' like any other pick.
    action: { type: String, enum: ['provider_selected', 'overridden'], required: true },
    // Full snapshots of the analysis's reviewer-relevant state, not just the
    // touched fields - see auditService.snapshotBcsAnalysis for exactly what
    // gets captured and why.
    before: { type: mongoose.Schema.Types.Mixed, required: true },
    after: { type: mongoose.Schema.Types.Mixed, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'audit_logs' }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
