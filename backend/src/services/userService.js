const User = require('../models/User');
const Membership = require('../models/Membership');
const Invitation = require('../models/Invitation');
const Role = require('../models/Role');
const { generateInviteToken } = require('./authService');
const { sendInviteEmail } = require('./emailService');
const config = require('../config/env');

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// "Org-Admin" is the direct successor of today's single global 'admin' role,
// but scoped per-organization now that role lives on Membership - the
// "can't remove the last admin" guard below is therefore per-organization
// too, not platform-wide.
const ORG_ADMIN_ROLE_NAME = 'Org-Admin';

async function getDefaultRole(name) {
  const role = await Role.findOne({ organization: null, name });
  if (!role) {
    const err = new Error(`Default role '${name}' has not been seeded.`);
    err.status = 500;
    throw err;
  }
  return role;
}

// Guards against a Facility-Admin (scoped to one facility) granting
// org-wide power to someone via invite/role-change - without this, widening
// their route access to user-management (done so they can manage their own
// facility's team) would silently let them hand out Org-Admin to anyone.
// Also confirms the role itself actually belongs to this organization (or
// is a platform default) rather than trusting a client-supplied roleId blind.
async function assertRoleGrantable(roleId, { callerRoleName, organizationId }) {
  const role = await Role.findById(roleId);
  if (!role) {
    const err = new Error('Invalid role.');
    err.status = 400;
    throw err;
  }
  if (role.organization && role.organization.toString() !== organizationId.toString()) {
    const err = new Error('That role does not belong to your organization.');
    err.status = 403;
    throw err;
  }
  if (callerRoleName === 'Facility-Admin' && role.name === ORG_ADMIN_ROLE_NAME) {
    const err = new Error('A Facility-Admin cannot grant the Org-Admin role.');
    err.status = 403;
    throw err;
  }
  return role;
}

// Invites an email into one organization (optionally scoped to one
// facility) with a given role. The invited email may already have a User
// account elsewhere on the platform - that's fine, this never touches
// User directly; accepting the invite is what creates a User (if needed)
// and the Membership.
async function inviteUser({ email, organizationId, facilityId, roleId, invitedBy, callerRoleName }) {
  const normalizedEmail = email.trim().toLowerCase();
  await assertRoleGrantable(roleId, { callerRoleName, organizationId });

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const existingMembership = await Membership.findOne({
      user: existingUser._id,
      organization: organizationId,
      facility: facilityId || null,
      status: 'active',
    });
    if (existingMembership) {
      const err = new Error('This person is already a member of this organization/facility.');
      err.status = 409;
      throw err;
    }
  }

  const { raw, hash } = generateInviteToken();
  const invitation = await Invitation.create({
    email: normalizedEmail,
    organization: organizationId,
    facility: facilityId || null,
    role: roleId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
    invitedBy,
    status: 'pending',
  });

  const inviteUrl = `${config.frontendUrl}/accept-invite?token=${raw}&email=${encodeURIComponent(normalizedEmail)}`;

  try {
    await sendInviteEmail({ to: normalizedEmail, name: normalizedEmail, inviteUrl });
  } catch (err) {
    invitation.status = 'failed';
    invitation.errorMessage = err.message;
    await invitation.save();
    throw err;
  }

  return invitation;
}

async function countOrgAdmins(organizationId, excludeMembershipId) {
  const orgAdminRole = await Role.findOne({ organization: null, name: ORG_ADMIN_ROLE_NAME });
  if (!orgAdminRole) return 0;
  const query = { organization: organizationId, role: orgAdminRole._id, status: 'active' };
  if (excludeMembershipId) query._id = { $ne: excludeMembershipId };
  return Membership.countDocuments(query);
}

async function listMemberships({ organizationId, facilityId, status = 'active' }) {
  const query = { organization: organizationId, status };
  if (facilityId) query.facility = facilityId;
  return Membership.find(query).populate('user', 'name email status').populate('role', 'name').sort({ createdAt: 1 });
}

// Every User on the platform with whatever active memberships they hold -
// super_admin's view, since they aren't scoped to any single organization
// the way listMemberships's callers are.
async function listAllUsersWithMemberships() {
  const users = await User.find({}).sort({ createdAt: 1 });
  const memberships = await Membership.find({ user: { $in: users.map((u) => u._id) }, status: 'active' })
    .populate('organization', 'name')
    .populate('facility', 'name')
    .populate('role', 'name');
  const membershipsByUser = new Map();
  for (const m of memberships) {
    const key = m.user.toString();
    if (!membershipsByUser.has(key)) membershipsByUser.set(key, []);
    membershipsByUser.get(key).push(m);
  }
  return users.map((user) => ({ user, memberships: membershipsByUser.get(user._id.toString()) || [] }));
}

// restrictFacilityId (only ever set for a Facility-Admin caller, never Org
// Admin/super_admin) additionally requires the target membership to belong
// to that one facility - a facility admin can't reach into a sibling
// facility under the same organization.
async function changeMembershipRole(membershipId, newRoleId, organizationId, restrictFacilityId, callerRoleName) {
  await assertRoleGrantable(newRoleId, { callerRoleName, organizationId });

  const query = { _id: membershipId, organization: organizationId };
  if (restrictFacilityId) query.facility = restrictFacilityId;
  const membership = await Membership.findOne(query).populate('role');
  if (!membership) {
    const err = new Error('Membership not found.');
    err.status = 404;
    throw err;
  }
  if (membership.role.name === ORG_ADMIN_ROLE_NAME) {
    const remaining = await countOrgAdmins(organizationId, membershipId);
    if (remaining === 0) {
      const err = new Error('Cannot demote the last remaining Org-Admin.');
      err.status = 400;
      throw err;
    }
  }
  membership.role = newRoleId;
  await membership.save();
  return membership.populate('role');
}

async function removeMembership(membershipId, organizationId, restrictFacilityId) {
  const query = { _id: membershipId, organization: organizationId };
  if (restrictFacilityId) query.facility = restrictFacilityId;
  const membership = await Membership.findOne(query).populate('role');
  if (!membership) {
    const err = new Error('Membership not found.');
    err.status = 404;
    throw err;
  }
  if (membership.role.name === ORG_ADMIN_ROLE_NAME) {
    const remaining = await countOrgAdmins(organizationId, membershipId);
    if (remaining === 0) {
      const err = new Error('Cannot remove the last remaining Org-Admin.');
      err.status = 400;
      throw err;
    }
  }
  // Soft removal, not a hard delete - this only revokes access to this one
  // organization/facility; the underlying User (and any other memberships
  // they hold elsewhere) is untouched.
  membership.status = 'removed';
  await membership.save();
}

module.exports = {
  ORG_ADMIN_ROLE_NAME,
  getDefaultRole,
  inviteUser,
  countOrgAdmins,
  listMemberships,
  listAllUsersWithMemberships,
  changeMembershipRole,
  removeMembership,
  INVITE_TOKEN_TTL_MS,
};
