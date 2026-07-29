const request = require('supertest');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember, createSuperAdmin } = require('../helpers');
const { hashPassword } = require('../../src/services/authService');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');

describe('super_admin session', () => {
  let app;
  beforeAll(async () => { await connect(); app = createApp(); });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('login skips the workspace picker entirely and issues a working super-admin session immediately', async () => {
    await User.create({ email: 'super@example.com', name: 'Super Admin', status: 'active', passwordHash: await hashPassword('correct-password') });
    // createSuperAdmin() creates its own User - this test wants control over
    // the password, so it wires the PlatformAdmin row directly instead.
    const PlatformAdmin = require('../../src/models/PlatformAdmin');
    const user = await User.findOne({ email: 'super@example.com' });
    await PlatformAdmin.create({ user: user._id });

    const res = await request(app).post('/api/auth/login').send({ email: 'super@example.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.body.isSuperAdmin).toBe(true);
    expect(res.body.membership).toBeNull();
    expect(res.body.accessToken).toBeTruthy();

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.body.isSuperAdmin).toBe(true);
    expect(me.body.membershipId).toBeNull();
  });

  it('GET /api/organizations is super_admin only', async () => {
    const { organization, facility, roles } = await createOrgAndFacility({ orgName: 'Good Farm' });
    await createOrgAndFacility({ orgName: 'Amul Dairy' });
    const staff = await createMember({ email: 'staff@example.com', name: 'Staff', organization, facility, role: roles.staff });
    const superAdmin = await createSuperAdmin();

    const staffRes = await request(app).get('/api/organizations').set('Authorization', `Bearer ${staff.token}`);
    expect(staffRes.status).toBe(403);

    const superRes = await request(app).get('/api/organizations').set('Authorization', `Bearer ${superAdmin.token}`);
    expect(superRes.status).toBe(200);
    expect(superRes.body.organizations.map((o) => o.name).sort()).toEqual(['Amul Dairy', 'Good Farm']);
  });

  it('GET /api/facilities lets super_admin view any organization\'s facilities via organizationId, and Org-Admin see only their own', async () => {
    const orgA = await createOrgAndFacility({ orgName: 'Good Farm', facilityName: 'Modasa' });
    const orgB = await createOrgAndFacility({ orgName: 'Amul Dairy', facilityName: 'Anand' });
    const orgAdmin = await createMember({ email: 'orgadmin@example.com', name: 'Org-Admin Person', organization: orgA.organization, facility: null, role: orgA.roles.orgAdmin });
    const superAdmin = await createSuperAdmin();

    const superRes = await request(app)
      .get(`/api/facilities?organizationId=${orgB.organization._id}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(superRes.status).toBe(200);
    expect(superRes.body.facilities.map((f) => f.name)).toEqual(['Anand']);

    // Org-Admin's own organizationId is used regardless of any query param -
    // they can never see another organization's facilities this way.
    const orgAdminRes = await request(app)
      .get(`/api/facilities?organizationId=${orgB.organization._id}`)
      .set('Authorization', `Bearer ${orgAdmin.token}`);
    expect(orgAdminRes.status).toBe(200);
    expect(orgAdminRes.body.facilities.map((f) => f.name)).toEqual(['Modasa']);
  });

  it('super_admin can view a specific facility\'s cows by supplying organizationId+facilityId', async () => {
    const { organization, facility } = await createOrgAndFacility();
    await Cow.create({ facility: facility._id, cowsId: '1042' });
    const superAdmin = await createSuperAdmin();

    const missingParams = await request(app).get('/api/cows').set('Authorization', `Bearer ${superAdmin.token}`);
    expect(missingParams.status).toBe(400);

    const res = await request(app)
      .get(`/api/cows?organizationId=${organization._id}&facilityId=${facility._id}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.cows.map((c) => c.cowsId)).toEqual(['1042']);
  });

  it('an Org-Admin can view a specific facility\'s cows within their own organization via facilityId, but not another organization\'s facility', async () => {
    const orgA = await createOrgAndFacility({ orgName: 'Good Farm', facilityName: 'Modasa' });
    const orgB = await createOrgAndFacility({ orgName: 'Amul Dairy', facilityName: 'Anand' });
    await Cow.create({ facility: orgA.facility._id, cowsId: '1042' });
    await Cow.create({ facility: orgB.facility._id, cowsId: '9999' });
    const orgAdmin = await createMember({ email: 'orgadmin2@example.com', name: 'Org-Admin Person', organization: orgA.organization, facility: null, role: orgA.roles.orgAdmin });

    const noFacilityId = await request(app).get('/api/cows').set('Authorization', `Bearer ${orgAdmin.token}`);
    expect(noFacilityId.status).toBe(400);

    const ownFacility = await request(app)
      .get(`/api/cows?facilityId=${orgA.facility._id}`)
      .set('Authorization', `Bearer ${orgAdmin.token}`);
    expect(ownFacility.status).toBe(200);
    expect(ownFacility.body.cows.map((c) => c.cowsId)).toEqual(['1042']);

    const otherOrgsFacility = await request(app)
      .get(`/api/cows?facilityId=${orgB.facility._id}`)
      .set('Authorization', `Bearer ${orgAdmin.token}`);
    expect(otherOrgsFacility.status).toBe(403);
  });

  it('Facility-Admin/Staff always use their own fixed facility, ignoring any query override', async () => {
    const orgA = await createOrgAndFacility({ orgName: 'Good Farm', facilityName: 'Modasa' });
    const orgB = await createOrgAndFacility({ orgName: 'Amul Dairy', facilityName: 'Anand' });
    await Cow.create({ facility: orgA.facility._id, cowsId: '1042' });
    await Cow.create({ facility: orgB.facility._id, cowsId: '9999' });
    const staff = await createMember({ email: 'staff3@example.com', name: 'Staff', organization: orgA.organization, facility: orgA.facility, role: orgA.roles.staff });

    // Attempting to override with orgB's facility is silently ignored - the
    // staff member's own facility is always what's used.
    const res = await request(app)
      .get(`/api/cows?facilityId=${orgB.facility._id}`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(res.status).toBe(200);
    expect(res.body.cows.map((c) => c.cowsId)).toEqual(['1042']);
  });

  it('GET /api/users returns every platform user with their memberships for super_admin', async () => {
    const { organization, facility, roles } = await createOrgAndFacility();
    await createMember({ email: 'staff4@example.com', name: 'Staff Four', organization, facility, role: roles.staff });
    const superAdmin = await createSuperAdmin();

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${superAdmin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.users.map((u) => u.email)).toContain('staff4@example.com');
    const staffUser = res.body.users.find((u) => u.email === 'staff4@example.com');
    expect(staffUser.memberships).toHaveLength(1);
    expect(staffUser.memberships[0].organization.name).toBe(organization.name);
    expect(staffUser.memberships[0].facility.name).toBe(facility.name);
    expect(staffUser.memberships[0].role.name).toBe('Staff');
  });

  it('POST /api/organizations creates a new organization (super_admin only)', async () => {
    const { organization, facility, roles } = await createOrgAndFacility();
    const staff = await createMember({ email: 'staff5@example.com', name: 'Staff', organization, facility, role: roles.staff });
    const superAdmin = await createSuperAdmin();

    const rejected = await request(app).post('/api/organizations').set('Authorization', `Bearer ${staff.token}`).send({ name: 'New Farm' });
    expect(rejected.status).toBe(403);

    const res = await request(app).post('/api/organizations').set('Authorization', `Bearer ${superAdmin.token}`).send({ name: 'Amul Dairy' });
    expect(res.status).toBe(201);
    expect(res.body.organization.name).toBe('Amul Dairy');
    expect(res.body.organization.slug).toBe('amul-dairy');

    const list = await request(app).get('/api/organizations').set('Authorization', `Bearer ${superAdmin.token}`);
    expect(list.body.organizations.map((o) => o.name)).toContain('Amul Dairy');
  });

  it('rejects creating a duplicate organization (same name/slug)', async () => {
    const superAdmin = await createSuperAdmin();
    await request(app).post('/api/organizations').set('Authorization', `Bearer ${superAdmin.token}`).send({ name: 'Amul Dairy' });
    const res = await request(app).post('/api/organizations').set('Authorization', `Bearer ${superAdmin.token}`).send({ name: 'Amul Dairy' });
    expect(res.status).toBe(409);
  });

  it('POST /api/facilities is super_admin only - facility setup is the platform admin\'s job, not the tenant\'s', async () => {
    const orgA = await createOrgAndFacility({ orgName: 'Good Farm', facilityName: 'Modasa' });
    const orgB = await createOrgAndFacility({ orgName: 'Amul Dairy', facilityName: 'Anand' });
    const orgAdmin = await createMember({ email: 'orgadmin3@example.com', name: 'Org-Admin Person', organization: orgA.organization, facility: null, role: orgA.roles.orgAdmin });
    const superAdmin = await createSuperAdmin();

    const superRes = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ organizationId: orgB.organization._id.toString(), name: 'Baroda' });
    expect(superRes.status).toBe(201);
    expect(superRes.body.facility.name).toBe('Baroda');

    const orgAdminRes = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${orgAdmin.token}`)
      .send({ organizationId: orgA.organization._id.toString(), name: 'Surat' });
    expect(orgAdminRes.status).toBe(403);

    const staffRes = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${(await createMember({ email: 'staff6@example.com', name: 'Staff', organization: orgA.organization, facility: orgA.facility, role: orgA.roles.staff })).token}`)
      .send({ organizationId: orgA.organization._id.toString(), name: 'Vadodara' });
    expect(staffRes.status).toBe(403);
  });

  it('end-to-end: super_admin creates an organization, adds a facility, and invites an Org-Admin into it', async () => {
    const Role = require('../../src/models/Role');
    await Role.create({ organization: null, name: 'Org-Admin', permissions: [] });
    const superAdmin = await createSuperAdmin();

    const orgRes = await request(app).post('/api/organizations').set('Authorization', `Bearer ${superAdmin.token}`).send({ name: 'Fresh Dairy Co' });
    expect(orgRes.status).toBe(201);
    const organizationId = orgRes.body.organization.id;

    const facilityRes = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ organizationId, name: 'Rajkot' });
    expect(facilityRes.status).toBe(201);

    const rolesRes = await request(app).get('/api/roles').set('Authorization', `Bearer ${superAdmin.token}`);
    const orgAdminRoleId = rolesRes.body.roles.find((r) => r.name === 'Org-Admin').id;

    const inviteRes = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ email: 'newowner@example.com', name: 'New Owner', roleId: orgAdminRoleId, organizationId });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.invitation.email).toBe('newowner@example.com');

    const Invitation = require('../../src/models/Invitation');
    const invitation = await Invitation.findOne({ email: 'newowner@example.com' });
    expect(invitation.organization.toString()).toBe(organizationId);
    expect(invitation.facility).toBeNull();
  });
});
