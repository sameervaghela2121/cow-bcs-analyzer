const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const Media = require('../../src/models/Media');
const Reading = require('../../src/models/Reading');
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
    cow = await Cow.create({ cowId: '6006' });
    const media = await Media.create({ storageKey: 'x.jpg', mimeType: 'image/jpeg', size: 1 });
    const r1 = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, createdBy: user._id });
    const r2 = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.25, createdBy: user._id });
    await AuditLog.create({ cow: cow._id, reading: r1._id, user: user._id, action: 'approved', oldScore: 3.0, newScore: 3.0 });
    await new Promise((r) => setTimeout(r, 10));
    await AuditLog.create({ cow: cow._id, reading: r2._id, user: user._id, action: 'overridden', oldScore: 3.25, newScore: 3.0 });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('lists audit entries reverse-chronologically', async () => {
    const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.entries[0].action).toBe('overridden');
    expect(res.body.entries[1].action).toBe('approved');
    expect(res.body.entries[0].cowId).toBe('6006');
  });

  it('filters by action', async () => {
    const res = await request(app).get('/api/audit?action=overridden').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('overridden');
  });

  it('filters by cowId', async () => {
    const otherCow = await Cow.create({ cowId: '7007' });
    const media = await Media.findOne();
    const r3 = await Reading.create({ cow: otherCow._id, media: media._id, status: 'scored', score: 3.0, createdBy: user._id });
    await AuditLog.create({ cow: otherCow._id, reading: r3._id, user: user._id, action: 'approved', oldScore: 3.0, newScore: 3.0 });

    const res = await request(app).get('/api/audit?cowId=7007').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].cowId).toBe('7007');
  });
});
