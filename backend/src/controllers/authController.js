const User = require('../models/User');
const Membership = require('../models/Membership');
const Invitation = require('../models/Invitation');
const PlatformAdmin = require('../models/PlatformAdmin');
const {
  hashToken,
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateSessionToken,
  generateSuperAdminToken,
} = require('../services/authService');

function serializeUser(user) {
  return { id: user._id.toString(), email: user.email, name: user.name, status: user.status };
}

function serializeMembership(membership) {
  return {
    id: membership._id.toString(),
    organization: {
      id: membership.organization._id.toString(),
      name: membership.organization.name,
      slug: membership.organization.slug,
    },
    facility: membership.facility
      ? { id: membership.facility._id.toString(), name: membership.facility.name, slug: membership.facility.slug }
      : null,
    role: { id: membership.role._id.toString(), name: membership.role.name },
  };
}

// Fetches every active membership for a user, populated for display/
// selection. Shared between listMemberships and the auto-select paths
// (login and acceptInvite) so "what counts as selectable" never drifts
// between the two entry points.
async function activeMembershipsFor(userId) {
  return Membership.find({ user: userId, status: 'active' })
    .populate('organization', 'name slug')
    .populate('facility', 'name slug')
    .populate('role', 'name permissions');
}

async function acceptInvite(req, res, next) {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ error: 'email, token and password are required.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const invitation = await Invitation.findOne({ email: normalizedEmail, status: 'pending' })
      .populate('organization')
      .populate('facility')
      .populate('role');
    if (!invitation) {
      return res.status(400).json({ error: 'Invalid or already-used invite.' });
    }
    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      return res.status(400).json({ error: 'This invite link has expired.' });
    }
    if (hashToken(token) !== invitation.tokenHash) {
      return res.status(400).json({ error: 'Invalid invite token.' });
    }

    // The invited email may already belong to a platform user (e.g. being
    // invited into a second organization) - reuse that account rather than
    // creating a duplicate.
    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = await User.create({
        email: normalizedEmail,
        name: normalizedEmail,
        passwordHash: await hashPassword(password),
        status: 'active',
      });
    } else if (user.status !== 'active') {
      user.passwordHash = await hashPassword(password);
      user.status = 'active';
      await user.save();
    }

    const membership = await Membership.create({
      user: user._id,
      organization: invitation.organization._id,
      facility: invitation.facility ? invitation.facility._id : null,
      role: invitation.role._id,
      invitedBy: invitation.invitedBy,
    });

    invitation.status = 'accepted';
    await invitation.save();

    // The invite already names an exact organization/facility/role - skip
    // the workspace picker and go straight to a working session for it.
    const accessToken = generateSessionToken({ user, membership, role: invitation.role });
    res.json({
      accessToken,
      user: serializeUser(user),
      membership: serializeMembership({
        _id: membership._id,
        organization: invitation.organization,
        facility: invitation.facility,
        role: invitation.role,
      }),
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || user.status !== 'active' || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // super_admin has no membership to select at all - "which
    // organization/facility" isn't a fixed fact about them, so they get a
    // working session immediately and choose per-request via the
    // Organizations/Facilities drill-down instead.
    const platformAdmin = await PlatformAdmin.findOne({ user: user._id });
    if (platformAdmin) {
      return res.json({
        accessToken: generateSuperAdminToken(user),
        user: serializeUser(user),
        membership: null,
        isSuperAdmin: true,
      });
    }

    // Auto-select when there's exactly one membership - most users belong
    // to a single workspace, and shouldn't see a picker for it. 0 or 2+
    // memberships fall through to /api/auth/memberships instead.
    const memberships = await activeMembershipsFor(user._id);
    if (memberships.length === 1) {
      const membership = memberships[0];
      return res.json({
        accessToken: generateSessionToken({ user, membership, role: membership.role }),
        user: serializeUser(user),
        membership: serializeMembership(membership),
      });
    }

    res.json({
      accessToken: generateAccessToken(user),
      user: serializeUser(user),
      membership: null,
    });
  } catch (err) {
    next(err);
  }
}

// No server-side session to revoke - tokens never expire and there's no
// refresh token to invalidate. Logging out is just the client discarding
// its stored token; this endpoint exists so that flow has a clear place to
// hang off of.
async function logout(_req, res) {
  res.json({ ok: true });
}

async function me(req, res) {
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    status: req.user.status,
    isSuperAdmin: req.user.isSuperAdmin,
    membershipId: req.user.membershipId,
    organizationId: req.user.organizationId,
    facilityId: req.user.facilityId,
    roleName: req.user.roleName,
  });
}

// The workspace picker: every active membership this user holds, for the
// frontend to render when login didn't already auto-select one.
async function listMemberships(req, res, next) {
  try {
    const memberships = await activeMembershipsFor(req.user.id);
    res.json({ memberships: memberships.map(serializeMembership) });
  } catch (err) {
    next(err);
  }
}

async function selectMembership(req, res, next) {
  try {
    const { membershipId } = req.body;
    if (!membershipId) {
      return res.status(400).json({ error: 'membershipId is required.' });
    }
    const membership = await Membership.findOne({ _id: membershipId, user: req.user.id, status: 'active' })
      .populate('organization', 'name slug')
      .populate('facility', 'name slug')
      .populate('role', 'name permissions');
    if (!membership) {
      return res.status(404).json({ error: 'Membership not found.' });
    }
    const user = await User.findById(req.user.id);
    res.json({
      accessToken: generateSessionToken({ user, membership, role: membership.role }),
      user: serializeUser(user),
      membership: serializeMembership(membership),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { acceptInvite, login, logout, me, listMemberships, selectMembership, serializeUser };
