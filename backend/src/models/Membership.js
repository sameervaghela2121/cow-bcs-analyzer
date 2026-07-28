const mongoose = require('mongoose');

// The core join: links a User to an Organization (and optionally one
// specific Facility) with a Role. A user can hold several of these - one
// per organization/facility they're part of - which is the whole reason
// this exists instead of a flat role/organization/facility on User itself.
//
// facility: null means organization-wide scope (e.g. an Org-Admin
// overseeing every facility under their organization); facility: <id>
// scopes the membership to just that one facility (Facility-Admin/Staff).
const membershipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', default: null },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'memberships' }
);

// No duplicate membership for the same user in the same org/facility scope.
membershipSchema.index({ user: 1, organization: 1, facility: 1 }, { unique: true });

module.exports = mongoose.model('Membership', membershipSchema);
