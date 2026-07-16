const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true },
    reading: { type: mongoose.Schema.Types.ObjectId, ref: 'Reading', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['approved', 'overridden'], required: true },
    oldScore: { type: Number, required: true },
    newScore: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
