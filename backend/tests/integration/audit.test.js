const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const AuditLog = require('../../src/models/AuditLog');
const config = require('../../src/config/env');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('GET /api/audit', () => {
  let app, token, cow, user;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    user = await User.create({ email: 'audit@example.com', name: 'Audit', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowsId: '6006' });
    const r1 = new mongoose.Types.ObjectId();
    const r2 = new mongoose.Types.ObjectId();
    await AuditLog.create({ cow: cow._id, reading: r1, user: user._id, action: 'approved', oldScore: 3.0, newScore: 3.0 });
    await new Promise((r) => setTimeout(r, 10));
    await AuditLog.create({ cow: cow._id, reading: r2, user: user._id, action: 'overridden', oldScore: 3.25, newScore: 3.0 });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('lists audit entries reverse-chronologically', async () => {
    const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.entries[0].action).toBe('overridden');
    expect(res.body.entries[1].action).toBe('approved');
    expect(res.body.entries[0].cowsId).toBe('6006');
  });

  it('filters by action', async () => {
    const res = await request(app).get('/api/audit?action=overridden').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('overridden');
  });

  it('filters by cowsId', async () => {
    const otherCow = await Cow.create({ cowsId: '7007' });
    const r3 = new mongoose.Types.ObjectId();
    await AuditLog.create({ cow: otherCow._id, reading: r3, user: user._id, action: 'approved', oldScore: 3.0, newScore: 3.0 });

    const res = await request(app).get('/api/audit?cowsId=7007').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].cowsId).toBe('7007');
  });
});
