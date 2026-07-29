const mongoose = require('mongoose');

// Marks a User as a super_admin - a platform operator, not scoped to any
// organization/facility at all, so it's a sibling of the org/facility tree
// rather than a Membership row. Only ever created by
// backend/scripts/seedSuperAdmin.js - there is deliberately no API route
// that writes to this collection.
const platformAdminSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  },
  { timestamps: true, collection: 'platform_admins' }
);

module.exports = mongoose.model('PlatformAdmin', platformAdminSchema);
