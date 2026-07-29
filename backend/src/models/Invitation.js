const mongoose = require('mongoose');

// Targets an email, not a User - the invited person may or may not already
// have an account (e.g. an existing platform user being invited into a
// second organization). Accepting creates a Membership; it only creates a
// new User if the email didn't already have one.
const invitationSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', default: null },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'expired', 'failed'], default: 'pending' },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invitation', invitationSchema);
