const {
  inviteUser,
  listMemberships,
  listAllUsersWithMemberships,
  changeMembershipRole,
  removeMembership,
} = require('../services/userService');

function serializeMembership(membership) {
  return {
    id: membership._id.toString(),
    user: membership.user
      ? { id: membership.user._id.toString(), name: membership.user.name, email: membership.user.email, status: membership.user.status }
      : null,
    facility: membership.facility ? membership.facility.toString() : null,
    role: membership.role ? { id: membership.role._id.toString(), name: membership.role.name } : null,
    status: membership.status,
  };
}

function serializeGlobalUser({ user, memberships }) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    status: user.status,
    memberships: memberships.map((m) => ({
      id: m._id.toString(),
      organization: { id: m.organization._id.toString(), name: m.organization.name },
      facility: m.facility ? { id: m.facility._id.toString(), name: m.facility.name } : null,
      role: { id: m.role._id.toString(), name: m.role.name },
    })),
  };
}

// A Facility-Admin can only invite into their own facility (the body's
// facilityId, if any, is ignored for them) - Org-Admin/super_admin invite
// wherever they specify.
async function invite(req, res, next) {
  try {
    const { email, name, roleId } = req.body;
    if (!email || !name || !roleId) {
      return res.status(400).json({ error: 'email, name and roleId are required.' });
    }
    const organizationId = req.user.isSuperAdmin ? req.body.organizationId : req.user.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required.' });
    }
    const facilityId = req.user.roleName === 'Facility-Admin' ? req.user.facilityId : req.body.facilityId || null;
    const invitation = await inviteUser({ email, organizationId, facilityId, roleId, invitedBy: req.user.id, callerRoleName: req.user.roleName });
    res.status(201).json({ invitation: { id: invitation._id.toString(), email: invitation.email, status: invitation.status } });
  } catch (err) {
    next(err);
  }
}

// super_admin sees every platform user (not organization-scoped); everyone
// else sees their own organization's memberships (a Facility-Admin should
// pass ?facilityId=<their own> from the frontend to narrow it to their
// facility, since the org-wide list is otherwise a valid superset).
async function list(req, res, next) {
  try {
    if (req.user.isSuperAdmin) {
      const results = await listAllUsersWithMemberships();
      return res.json({ users: results.map(serializeGlobalUser) });
    }
    const { facilityId, status } = req.query;
    const memberships = await listMemberships({ organizationId: req.user.organizationId, facilityId, status });
    res.json({ memberships: memberships.map(serializeMembership) });
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    if (!req.body.roleId) {
      return res.status(400).json({ error: 'roleId is required.' });
    }
    const restrictFacilityId = req.user.roleName === 'Facility-Admin' ? req.user.facilityId : null;
    const membership = await changeMembershipRole(req.params.id, req.body.roleId, req.user.organizationId, restrictFacilityId, req.user.roleName);
    res.json({ membership: serializeMembership(membership) });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const restrictFacilityId = req.user.roleName === 'Facility-Admin' ? req.user.facilityId : null;
    await removeMembership(req.params.id, req.user.organizationId, restrictFacilityId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { invite, list, updateRole, remove };
