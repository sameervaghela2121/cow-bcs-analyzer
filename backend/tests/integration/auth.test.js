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

describe('auth middleware', () => {
  let app;

  beforeAll(async () => {
    await connect();
    app = createApp();
    routes.get('/_test/whoami', requireAuth(), (req, res) => res.json({ user: req.user }));
    routes.get('/_test/admin-only', requireAuth(), requireRole('admin'), (req, res) =>
      res.json({ ok: true })
    );
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

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
