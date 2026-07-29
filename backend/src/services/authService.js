const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// No expiresIn: tokens never expire, so there's no refresh flow to keep
// them alive - login once and stay signed in.
//
// Two distinct token shapes, both verified the same way (requireAuth()
// doesn't care which one it's holding - it just fills in whatever session
// claims are present, or leaves them null):
//
// - "login" token: just {sub} - proves who you are, nothing else. Issued
//   right after password check; only enough to list/select a membership.
// - "session" token: {sub, membershipId, organizationId, facilityId,
//   roleId, roleName, permissions} - issued once a membership is selected
//   (or auto-selected, if there's only one) and is what every tenant-scoped
//   route actually requires (see middleware/auth.js's requireSession()).
//   permissions/roleName are a snapshot at issuance time - since tokens
//   never expire, a Role edited afterwards won't retroactively change an
//   already-issued session until the holder selects a membership again.
function generateAccessToken(user) {
  return jwt.sign({ sub: user._id.toString() }, config.jwtAccessSecret);
}

// membership.organization/facility may be a plain ObjectId or a populated
// document depending on the caller (login()/selectMembership() populate for
// display, acceptInvite() passes a freshly-created unpopulated Membership) -
// reading ._id first handles both without the caller having to care.
function idOf(value) {
  return (value._id || value).toString();
}

function generateSessionToken({ user, membership, role }) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      membershipId: membership._id.toString(),
      organizationId: idOf(membership.organization),
      facilityId: membership.facility ? idOf(membership.facility) : null,
      roleId: role._id.toString(),
      roleName: role.name,
      permissions: role.permissions,
    },
    config.jwtAccessSecret
  );
}

// super_admin has no Membership at all (it's platform-wide, tracked via the
// separate PlatformAdmin collection) - it gets its own token shape, issued
// straight from login with no workspace-picker step, since "which
// organization/facility" isn't a fixed fact about a super_admin the way it
// is for every other role - they choose per-request via the Organizations/
// Facilities drill-down instead (see middleware/auth.js's resolveScope()).
function generateSuperAdminToken(user) {
  return jwt.sign({ sub: user._id.toString(), isSuperAdmin: true }, config.jwtAccessSecret);
}

function generateInviteToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateSessionToken,
  generateSuperAdminToken,
  generateInviteToken,
  hashToken,
};
