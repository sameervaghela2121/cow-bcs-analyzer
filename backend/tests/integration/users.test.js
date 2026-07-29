jest.mock('../../src/services/emailService', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember } = require('../helpers');
const Invitation = require('../../src/models/Invitation');
const Membership = require('../../src/models/Membership');
const { sendInviteEmail } = require('../../src/services/emailService');

// connect()/closeDatabase() are hoisted to file scope rather than scoped to
// the first describe (see auth.test.js's comment on this same pattern).
beforeAll(async () => { await connect(); });
afterAll(async () => { await closeDatabase(); });

describe('POST /api/users/invite', () => {
  let app, organization, facility, roles, orgAdminToken;

  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    ({ organization, facility, roles } = await createOrgAndFacility());
    const admin = await createMember({ email: 'orgadmin@example.com', name: 'Org-Admin', organization, facility: null, role: roles.orgAdmin });
    orgAdminToken = admin.token;
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

  it('rejects non-Org-Admins', async () => {
    const staff = await createMember({ email: 'staff@example.com', name: 'Staff', organization, facility, role: roles.staff });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ email: 'new@example.com', name: 'New Person', roleId: roles.staff._id.toString(), facilityId: facility._id.toString() });
    expect(res.status).toBe(403);
  });

  it('creates a pending invitation and sends an invite email', async () => {
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: 'new@example.com', name: 'New Person', roleId: roles.staff._id.toString(), facilityId: facility._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.invitation.status).toBe('pending');
    expect(res.body.invitation.email).toBe('new@example.com');
    expect(sendInviteEmail).toHaveBeenCalledTimes(1);

    const invitation = await Invitation.findOne({ email: 'new@example.com' });
    expect(invitation).toBeTruthy();
    expect(invitation.tokenHash).toBeTruthy();
    expect(invitation.organization.toString()).toBe(organization._id.toString());
    expect(invitation.facility.toString()).toBe(facility._id.toString());
    expect(invitation.role.toString()).toBe(roles.staff._id.toString());
  });

  it('allows inviting an org-wide role with no facility', async () => {
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: 'neworgadmin@example.com', name: 'New Org-Admin', roleId: roles.orgAdmin._id.toString() });

    expect(res.status).toBe(201);
    const invitation = await Invitation.findOne({ email: 'neworgadmin@example.com' });
    expect(invitation.facility).toBeNull();
  });

  it('rejects inviting an email that is already an active member of this organization/facility', async () => {
    await createMember({ email: 'dup@example.com', name: 'Dup', organization, facility, role: roles.staff });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: 'dup@example.com', name: 'Dup Two', roleId: roles.staff._id.toString(), facilityId: facility._id.toString() });
    expect(res.status).toBe(409);
  });

  it('logs a failed invitation when the invite email fails to send', async () => {
    sendInviteEmail.mockRejectedValueOnce(new Error('SMTP is down'));
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: 'unreachable@example.com', name: 'Unreachable', roleId: roles.staff._id.toString(), facilityId: facility._id.toString() });

    expect(res.status).toBe(500);
    const invitation = await Invitation.findOne({ email: 'unreachable@example.com' });
    expect(invitation).toBeTruthy();
    expect(invitation.status).toBe('failed');
    expect(invitation.errorMessage).toBe('SMTP is down');
  });

  it('rejects a Facility-Admin trying to invite someone as Org-Admin (privilege escalation)', async () => {
    const facilityAdmin = await createMember({ email: 'facadmin@example.com', name: 'Facility-Admin', organization, facility, role: roles.facilityAdmin });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${facilityAdmin.token}`)
      .send({ email: 'sneaky@example.com', name: 'Sneaky', roleId: roles.orgAdmin._id.toString() });
    expect(res.status).toBe(403);
    expect(await Invitation.findOne({ email: 'sneaky@example.com' })).toBeNull();
  });

  it('allows a Facility-Admin to invite Staff/Facility-Admin into their own facility', async () => {
    const facilityAdmin = await createMember({ email: 'facadmin2@example.com', name: 'Facility-Admin', organization, facility, role: roles.facilityAdmin });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${facilityAdmin.token}`)
      .send({ email: 'newstaff@example.com', name: 'New Staff', roleId: roles.staff._id.toString() });
    expect(res.status).toBe(201);
    const invitation = await Invitation.findOne({ email: 'newstaff@example.com' });
    expect(invitation.facility.toString()).toBe(facility._id.toString());
  });

  it('rejects a roleId belonging to a different organization\'s custom role', async () => {
    const Role = require('../../src/models/Role');
    const otherOrg = await createOrgAndFacility();
    const foreignRole = await Role.create({ organization: otherOrg.organization._id, name: 'Vet', permissions: [] });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: 'cross-org@example.com', name: 'Cross Org', roleId: foreignRole._id.toString(), facilityId: facility._id.toString() });
    expect(res.status).toBe(403);
  });
});

describe('GET/PATCH/DELETE /api/users', () => {
  let app, organization, facility, roles, orgAdminToken, orgAdminMembership;

  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    ({ organization, facility, roles } = await createOrgAndFacility());
    const admin = await createMember({ email: 'orgadmin2@example.com', name: 'Org-Admin2', organization, facility: null, role: roles.orgAdmin });
    orgAdminToken = admin.token;
    orgAdminMembership = admin.membership;
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

  it('lists memberships in the organization', async () => {
    await createMember({ email: 'a@example.com', name: 'A', organization, facility, role: roles.staff });
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${orgAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.memberships.length).toBe(2);
  });

  it('changes a membership\'s role', async () => {
    const staff = await createMember({ email: 'b@example.com', name: 'B', organization, facility, role: roles.staff });
    const res = await request(app)
      .patch(`/api/users/${staff.membership._id}/role`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ roleId: roles.facilityAdmin._id.toString() });
    expect(res.status).toBe(200);
    expect(res.body.membership.role.name).toBe('Facility-Admin');
  });

  it('rejects a Facility-Admin trying to promote someone to Org-Admin (privilege escalation)', async () => {
    const facilityAdmin = await createMember({ email: 'facadmin3@example.com', name: 'Facility-Admin', organization, facility, role: roles.facilityAdmin });
    const staff = await createMember({ email: 'd@example.com', name: 'D', organization, facility, role: roles.staff });
    const res = await request(app)
      .patch(`/api/users/${staff.membership._id}/role`)
      .set('Authorization', `Bearer ${facilityAdmin.token}`)
      .send({ roleId: roles.orgAdmin._id.toString() });
    expect(res.status).toBe(403);
    const membership = await Membership.findById(staff.membership._id);
    expect(membership.role.toString()).toBe(roles.staff._id.toString());
  });

  it('refuses to demote the last remaining Org-Admin', async () => {
    const res = await request(app)
      .patch(`/api/users/${orgAdminMembership._id}/role`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ roleId: roles.staff._id.toString() });
    expect(res.status).toBe(400);
  });

  it('removes a membership (soft) without deleting the underlying User', async () => {
    const staff = await createMember({ email: 'c@example.com', name: 'C', organization, facility, role: roles.staff });
    const res = await request(app).delete(`/api/users/${staff.membership._id}`).set('Authorization', `Bearer ${orgAdminToken}`);
    expect(res.status).toBe(200);

    const membership = await Membership.findById(staff.membership._id);
    expect(membership.status).toBe('removed');
    const User = require('../../src/models/User');
    expect(await User.findById(staff.user._id)).toBeTruthy();
  });

  it('refuses to remove the last remaining Org-Admin', async () => {
    const res = await request(app).delete(`/api/users/${orgAdminMembership._id}`).set('Authorization', `Bearer ${orgAdminToken}`);
    expect(res.status).toBe(400);
  });
});
