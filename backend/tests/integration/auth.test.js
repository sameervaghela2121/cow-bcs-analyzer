const request = require('supertest');
const crypto = require('crypto');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember } = require('../helpers');
const User = require('../../src/models/User');
const Membership = require('../../src/models/Membership');
const Invitation = require('../../src/models/Invitation');
const { generateAccessToken, hashPassword } = require('../../src/services/authService');
const { requireAuth, requireSession, requireRole } = require('../../src/middleware/auth');
// Adding test-only routes directly onto `app` after createApp() returns
// would be unreachable: createApp() already registers a catch-all 404
// handler before returning. Instead, add them onto the `routes` router
// singleton, which app.js mounts at /api and consults per-request.
const routes = require('../../src/routes');

// connect()/closeDatabase() are hoisted to file scope (rather than scoped to
// the first describe, as an earlier draft had it) because this file
// accumulates a new describe block per task. A describe-scoped
// afterAll(closeDatabase) closes the shared connection as soon as that
// describe's own tests finish, breaking every describe added after it.
beforeAll(async () => { await connect(); });
afterAll(async () => { await closeDatabase(); });

describe('auth middleware', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
    routes.get('/_test/whoami', requireAuth(), (req, res) => res.json({ user: req.user }));
    routes.get('/_test/org-admin-only', requireAuth(), requireSession(), requireRole('Org-Admin'), (_req, res) =>
      res.json({ ok: true })
    );
  });
  afterEach(async () => { await clearDatabase(); });

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/_test/whoami');
    expect(res.status).toBe(401);
  });

  it('accepts a valid login-only access token for an active user', async () => {
    const user = await User.create({ email: 'staff@example.com', name: 'Staff One', status: 'active', passwordHash: 'x' });
    const token = generateAccessToken(user);
    const res = await request(app).get('/api/_test/whoami').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('staff@example.com');
    expect(res.body.user.membershipId).toBeNull();
  });

  it('rejects a token for a pending (not yet active) user', async () => {
    const user = await User.create({ email: 'pending@example.com', name: 'Pending One', status: 'pending' });
    const token = generateAccessToken(user);
    const res = await request(app).get('/api/_test/whoami').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('blocks a login-only token (no membership selected yet) from a session-gated route', async () => {
    const user = await User.create({ email: 'staff2@example.com', name: 'Staff Two', status: 'active', passwordHash: 'x' });
    const token = generateAccessToken(user);
    const res = await request(app).get('/api/_test/org-admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('blocks a non-Org-Admin role from an Org-Admin-only route', async () => {
    const { organization, facility, roles } = await createOrgAndFacility();
    const { token } = await createMember({ email: 'staff3@example.com', name: 'Staff Three', organization, facility, role: roles.staff });
    const res = await request(app).get('/api/_test/org-admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows an Org-Admin through the Org-Admin-only route', async () => {
    const { organization, roles } = await createOrgAndFacility();
    const { token } = await createMember({ email: 'orgadmin@example.com', name: 'Org-Admin Person', organization, facility: null, role: roles.orgAdmin });
    const res = await request(app).get('/api/_test/org-admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/accept-invite', () => {
  let app, organization, facility, roles;

  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    ({ organization, facility, roles } = await createOrgAndFacility());
  });
  afterEach(async () => { await clearDatabase(); });

  async function makeInvitation({ email, tokenHash, expiresAt, role, facilityId = facility._id, status = 'pending' }) {
    const invitedBy = new (require('mongoose').Types.ObjectId)();
    return Invitation.create({
      email, organization: organization._id, facility: facilityId, role: role._id,
      tokenHash, expiresAt, invitedBy, status,
    });
  }

  it('creates a new user and an active membership from a valid pending invite', async () => {
    const raw = 'a'.repeat(64);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await makeInvitation({ email: 'pending@example.com', tokenHash: hash, expiresAt: new Date(Date.now() + 60000), role: roles.staff });

    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'pending@example.com', token: raw, password: 'new-password-123',
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.status).toBe('active');
    expect(res.body.membership.organization.id).toBe(organization._id.toString());
    expect(res.body.membership.facility.id).toBe(facility._id.toString());
    expect(res.body.membership.role.name).toBe('Staff');

    const updated = await User.findOne({ email: 'pending@example.com' });
    expect(updated.status).toBe('active');
    expect(updated.passwordHash).toBeTruthy();

    const membership = await Membership.findOne({ user: updated._id });
    expect(membership).toBeTruthy();
    expect(membership.status).toBe('active');

    const invitation = await Invitation.findOne({ email: 'pending@example.com' });
    expect(invitation.status).toBe('accepted');
  });

  it('reuses an existing User account when the invited email already has one (joining a second organization)', async () => {
    const existing = await User.create({ email: 'already@example.com', name: 'Already Here', status: 'active', passwordHash: 'old-hash' });
    const raw = 'e'.repeat(64);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await makeInvitation({ email: 'already@example.com', tokenHash: hash, expiresAt: new Date(Date.now() + 60000), role: roles.staff });

    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'already@example.com', token: raw, password: 'new-password-123',
    });

    expect(res.status).toBe(200);
    const usersWithEmail = await User.countDocuments({ email: 'already@example.com' });
    expect(usersWithEmail).toBe(1);
    expect(res.body.user.id).toBe(existing._id.toString());
  });

  it('rejects an expired invite token', async () => {
    const raw = 'b'.repeat(64);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await makeInvitation({ email: 'expired@example.com', tokenHash: hash, expiresAt: new Date(Date.now() - 1000), role: roles.staff });
    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'expired@example.com', token: raw, password: 'new-password-123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a wrong token', async () => {
    const hash = crypto.createHash('sha256').update('c'.repeat(64)).digest('hex');
    await makeInvitation({ email: 'wrong@example.com', tokenHash: hash, expiresAt: new Date(Date.now() + 60000), role: roles.staff });
    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'wrong@example.com', token: 'd'.repeat(64), password: 'new-password-123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an already-accepted invite', async () => {
    const raw = 'f'.repeat(64);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await makeInvitation({ email: 'usedup@example.com', tokenHash: hash, expiresAt: new Date(Date.now() + 60000), role: roles.staff, status: 'accepted' });
    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'usedup@example.com', token: raw, password: 'new-password-123',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  let app;
  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  it('auto-selects the session when the user has exactly one membership', async () => {
    const { organization, facility, roles } = await createOrgAndFacility();
    const user = await User.create({ email: 'single@example.com', name: 'Single', status: 'active', passwordHash: await hashPassword('correct-password') });
    await Membership.create({ user: user._id, organization: organization._id, facility: facility._id, role: roles.staff._id });

    const res = await request(app).post('/api/auth/login').send({ email: 'single@example.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.membership).not.toBeNull();
    expect(res.body.membership.organization.id).toBe(organization._id.toString());
  });

  it('returns membership: null (no auto-select) when the user has zero memberships', async () => {
    await User.create({ email: 'nomembership@example.com', name: 'No Membership', status: 'active', passwordHash: await hashPassword('correct-password') });
    const res = await request(app).post('/api/auth/login').send({ email: 'nomembership@example.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.body.membership).toBeNull();
  });

  it('returns membership: null (no auto-select) when the user has two or more memberships', async () => {
    const orgA = await createOrgAndFacility();
    const orgB = await createOrgAndFacility();
    const user = await User.create({ email: 'multi@example.com', name: 'Multi', status: 'active', passwordHash: await hashPassword('correct-password') });
    await Membership.create({ user: user._id, organization: orgA.organization._id, facility: orgA.facility._id, role: orgA.roles.staff._id });
    await Membership.create({ user: user._id, organization: orgB.organization._id, facility: orgB.facility._id, role: orgB.roles.staff._id });

    const res = await request(app).post('/api/auth/login').send({ email: 'multi@example.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.body.membership).toBeNull();
  });

  it('rejects the wrong password', async () => {
    await User.create({ email: 'active2@example.com', name: 'Active Two', status: 'active', passwordHash: await hashPassword('correct-password') });
    const res = await request(app).post('/api/auth/login').send({ email: 'active2@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects login for a pending (not yet activated) user', async () => {
    await User.create({ email: 'pend@example.com', name: 'Pend', status: 'pending' });
    const res = await request(app).post('/api/auth/login').send({ email: 'pend@example.com', password: 'anything' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/memberships and POST /api/auth/select-membership', () => {
  let app;
  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  it('lists every active membership for the logged-in user, and select-membership issues a working session', async () => {
    const orgA = await createOrgAndFacility();
    const orgB = await createOrgAndFacility();
    const user = await User.create({ email: 'picker@example.com', name: 'Picker', status: 'active', passwordHash: await hashPassword('correct-password') });
    const membershipA = await Membership.create({ user: user._id, organization: orgA.organization._id, facility: orgA.facility._id, role: orgA.roles.staff._id });
    await Membership.create({ user: user._id, organization: orgB.organization._id, facility: orgB.facility._id, role: orgB.roles.staff._id });

    const loginToken = generateAccessToken(user);
    const listRes = await request(app).get('/api/auth/memberships').set('Authorization', `Bearer ${loginToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.memberships).toHaveLength(2);

    const selectRes = await request(app)
      .post('/api/auth/select-membership')
      .set('Authorization', `Bearer ${loginToken}`)
      .send({ membershipId: membershipA._id.toString() });
    expect(selectRes.status).toBe(200);
    expect(selectRes.body.accessToken).toBeTruthy();
    expect(selectRes.body.membership.organization.id).toBe(orgA.organization._id.toString());
  });

  it('rejects selecting a membership that does not belong to the caller', async () => {
    const { organization, facility, roles } = await createOrgAndFacility();
    const outsider = await User.create({ email: 'outsider@example.com', name: 'Outsider', status: 'active', passwordHash: 'x' });
    const { membership } = await createMember({ email: 'owner@example.com', name: 'Owner', organization, facility, role: roles.staff });

    const outsiderLoginToken = generateAccessToken(outsider);
    const res = await request(app)
      .post('/api/auth/select-membership')
      .set('Authorization', `Bearer ${outsiderLoginToken}`)
      .send({ membershipId: membership._id.toString() });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/auth/logout', () => {
  let app;
  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  it('accepts a valid access token and confirms logout', async () => {
    await User.create({ email: 'logout@example.com', name: 'Logout', status: 'active', passwordHash: await hashPassword('correct-password') });
    const login = await request(app).post('/api/auth/login').send({ email: 'logout@example.com', password: 'correct-password' });
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects logout with no access token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let app;
  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  it('returns the current user and session context for a valid access token', async () => {
    const { organization, facility, roles } = await createOrgAndFacility();
    const { token } = await createMember({ email: 'me@example.com', name: 'Me', organization, facility, role: roles.orgAdmin });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@example.com');
    expect(res.body.roleName).toBe('Org-Admin');
    expect(res.body.organizationId).toBe(organization._id.toString());
  });
});
