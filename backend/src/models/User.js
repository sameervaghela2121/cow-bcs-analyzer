const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
    status: { type: String, enum: ['pending', 'active'], default: 'pending' },
    passwordHash: { type: String, default: null },
    inviteTokenHash: { type: String, default: null },
    inviteTokenExpiresAt: { type: Date, default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    refreshTokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
