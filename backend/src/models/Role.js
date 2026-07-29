const mongoose = require('mongoose');

// organization: null means a platform-default role, available to every
// organization (seeded once: "Org-Admin", "Facility-Admin", "Staff").
// organization: <id> is a custom role scoped to just that org. Permissions
// live only here, never copied onto a Membership - a Membership always
// resolves its permissions by looking this up fresh, so editing a Role's
// permissions takes effect for every membership using it immediately
// instead of drifting from a stale snapshot.
const roleSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    name: { type: String, required: true, trim: true },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'roles' }
);

module.exports = mongoose.model('Role', roleSchema);
