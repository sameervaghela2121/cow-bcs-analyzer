const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const config = require('../../src/config/env');
const { requireAuth, requireRole } = require('../../src/middleware/auth');
// Adding test-only routes directly onto `app` after createApp() returns
// would be unreachable: createApp() already registers a catch-all 404
// handler before returning. Instead, add them onto the `routes` router
// singleton, which app.js mounts at /api and consults per-request.
const routes = require('../../src/routes');

// connect()/closeDatabase() are hoisted to file scope (rather than scoped to
// the first describe, as an earlier draft had it) because this file
// accumulates a new describe block per task (Tasks 7-10 all append here).
// A describe-scoped afterAll(closeDatabase) closes the shared connection as
// soon as that describe's own tests finish, breaking every describe added
// after it.
beforeAll(async () => { await connect(); });
afterAll(async () => { await closeDatabase(); });

describe('auth middleware', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
    routes.get('/_test/whoami', requireAuth(), (req, res) => res.json({ user: req.user }));
    routes.get('/_test/admin-only', requireAuth(), requireRole('admin'), (req, res) =>
      res.json({ ok: true })
    );
  });
  afterEach(async () => { await clearDatabase(); });

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/_test/whoami');
    expect(res.status).toBe(401);
  });

  it('accepts a valid access token for an active user', async () => {
    const user = await User.create({
      email: 'staff@example.com',
      name: 'Staff One',
      role: 'staff',
      status: 'active',
      passwordHash: 'x',
    });
    const token = jwt.sign({ sub: user._id.toString(), role: 'staff' }, config.jwtAccessSecret, {
      expiresIn: '15m',
    });
    const res = await request(app)
      .get('/api/_test/whoami')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('staff@example.com');
  });

  it('rejects a token for a pending (not yet active) user', async () => {
    const user = await User.create({
      email: 'pending@example.com',
      name: 'Pending One',
      role: 'staff',
      status: 'pending',
    });
    const token = jwt.sign({ sub: user._id.toString(), role: 'staff' }, config.jwtAccessSecret, {
      expiresIn: '15m',
    });
    const res = await request(app)
      .get('/api/_test/whoami')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('blocks non-admin roles from an admin-only route', async () => {
    const user = await User.create({
      email: 'staff2@example.com', name: 'Staff Two', role: 'staff', status: 'active', passwordHash: 'x',
    });
    const token = jwt.sign({ sub: user._id.toString(), role: 'staff' }, config.jwtAccessSecret, { expiresIn: '15m' });
    const res = await request(app).get('/api/_test/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/accept-invite', () => {
  let app;
  const crypto = require('crypto');
  const User = require('../../src/models/User');

  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  it('activates a pending user with a valid token and sets their password', async () => {
    const raw = 'a'.repeat(64);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await User.create({
      email: 'pending@example.com', name: 'Pending', role: 'staff', status: 'pending',
      inviteTokenHash: hash, inviteTokenExpiresAt: new Date(Date.now() + 60000),
    });

    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'pending@example.com', token: raw, password: 'new-password-123',
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.status).toBe('active');

    const updated = await User.findOne({ email: 'pending@example.com' });
    expect(updated.status).toBe('active');
    expect(updated.passwordHash).toBeTruthy();
    expect(updated.inviteTokenHash).toBeNull();
  });

  it('rejects an expired invite token', async () => {
    const raw = 'b'.repeat(64);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await User.create({
      email: 'expired@example.com', name: 'Expired', role: 'staff', status: 'pending',
      inviteTokenHash: hash, inviteTokenExpiresAt: new Date(Date.now() - 1000),
    });
    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'expired@example.com', token: raw, password: 'new-password-123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a wrong token', async () => {
    const hash = crypto.createHash('sha256').update('c'.repeat(64)).digest('hex');
    await User.create({
      email: 'wrong@example.com', name: 'Wrong', role: 'staff', status: 'pending',
      inviteTokenHash: hash, inviteTokenExpiresAt: new Date(Date.now() + 60000),
    });
    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'wrong@example.com', token: 'd'.repeat(64), password: 'new-password-123',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  let app;
  const { hashPassword } = require('../../src/services/authService');
  const User = require('../../src/models/User');

  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  it('logs in an active user with the correct password', async () => {
    await User.create({
      email: 'active@example.com', name: 'Active', role: 'staff', status: 'active',
      passwordHash: await hashPassword('correct-password'),
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'active@example.com', password: 'correct-password',
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe('active@example.com');
  });

  it('rejects the wrong password', async () => {
    await User.create({
      email: 'active2@example.com', name: 'Active Two', role: 'staff', status: 'active',
      passwordHash: await hashPassword('correct-password'),
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'active2@example.com', password: 'wrong-password',
    });
    expect(res.status).toBe(401);
  });

  it('rejects login for a pending (not yet activated) user', async () => {
    await User.create({ email: 'pend@example.com', name: 'Pend', role: 'staff', status: 'pending' });
    const res = await request(app).post('/api/auth/login').send({
      email: 'pend@example.com', password: 'anything',
    });
    expect(res.status).toBe(401);
  });
});
