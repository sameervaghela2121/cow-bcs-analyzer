// Shared multi-tenant test fixtures - every integration test needs an
// Organization/Facility/Role/Membership/session token to exercise a
// tenant-scoped route, so this centralizes that setup instead of every
// test file hand-rolling its own JWT (which would drift from the real
// signing logic in authService.js).
const User = require('../src/models/User');
const Organization = require('../src/models/Organization');
const Facility = require('../src/models/Facility');
const Role = require('../src/models/Role');
const Membership = require('../src/models/Membership');
const PlatformAdmin = require('../src/models/PlatformAdmin');
const { generateSessionToken, generateSuperAdminToken } = require('../src/services/authService');

let orgCounter = 0;

// slug gets a counter suffix so tests that spin up several
// organizations/facilities in the same run (e.g. to prove tenant isolation)
// never collide on the unique slug index by default.
async function createOrgAndFacility({ orgName = 'Good Farm', facilityName = 'Modasa' } = {}) {
  orgCounter += 1;
  const organization = await Organization.create({
    name: orgName,
    slug: `${orgName.toLowerCase().replace(/\s+/g, '-')}-${orgCounter}`,
  });
  const facility = await Facility.create({
    organization: organization._id,
    name: facilityName,
    slug: facilityName.toLowerCase().replace(/\s+/g, '-'),
  });
  const orgAdminRole = await Role.create({ organization: null, name: 'Org-Admin', permissions: [] });
  const facilityAdminRole = await Role.create({ organization: null, name: 'Facility-Admin', permissions: [] });
  const staffRole = await Role.create({ organization: null, name: 'Staff', permissions: [] });
  return { organization, facility, roles: { orgAdmin: orgAdminRole, facilityAdmin: facilityAdminRole, staff: staffRole } };
}

// Creates a User + an active Membership for them, and returns a ready-to-use
// session token via the real generateSessionToken (not a hand-built JWT).
async function createMember({ email, name, organization, facility = null, role }) {
  const user = await User.create({ email, name, status: 'active', passwordHash: 'x' });
  const membership = await Membership.create({
    user: user._id,
    organization: organization._id,
    facility: facility ? facility._id : null,
    role: role._id,
  });
  const token = generateSessionToken({ user, membership, role });
  return { user, membership, token };
}

// super_admin has no Membership at all - just a User + a PlatformAdmin row.
async function createSuperAdmin({ email = 'super@example.com', name = 'Super Admin' } = {}) {
  const user = await User.create({ email, name, status: 'active', passwordHash: 'x' });
  await PlatformAdmin.create({ user: user._id });
  const token = generateSuperAdminToken(user);
  return { user, token };
}

module.exports = { createOrgAndFacility, createMember, createSuperAdmin };
