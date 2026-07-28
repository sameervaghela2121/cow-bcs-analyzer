const mongoose = require('mongoose');

// Pure authentication - who this person is and how they log in. Which
// organizations/facilities they belong to, and with what role, lives on
// Membership instead (see models/Membership.js) so one person can hold
// different roles at different facilities, or belong to more than one
// organization, without needing a second account.
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'active'], default: 'pending' },
    passwordHash: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
