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

describe('Review queue', () => {
  let app, token, cow, media;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'rev@example.com', name: 'Rev', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowId: '3003' });
    media = await Media.create({ storageKey: 'x.jpg', mimeType: 'image/jpeg', size: 1 });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('lists only pending-review readings', async () => {
    await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, band: 'ideal', confidence: 'low', flagged: true, reviewStatus: 'pending', flagReason: 'low confidence', capturedAt: new Date(), createdBy: (await User.findOne())._id });
    await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.25, band: 'ideal', confidence: 'high', flagged: false, reviewStatus: 'not_required', capturedAt: new Date(), createdBy: (await User.findOne())._id });

    const res = await request(app).get('/api/review/queue').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].reviewStatus).toBe('pending');
  });

  it('approves a reading', async () => {
    const user = await User.findOne();
    const reading = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, band: 'ideal', confidence: 'low', flagged: true, reviewStatus: 'pending', createdBy: user._id });

    const res = await request(app).post(`/api/review/${reading._id}/approve`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const updated = await Reading.findById(reading._id);
    expect(updated.reviewStatus).toBe('approved');
    expect(updated.flagged).toBe(false);

    const logs = await AuditLog.find({ reading: reading._id });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('approved');
    expect(logs[0].oldScore).toBe(3.0);
    expect(logs[0].newScore).toBe(3.0);
  });

  it('overrides a reading with a new score, validated to the 0.25 grid', async () => {
    const user = await User.findOne();
    const reading = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, band: 'ideal', confidence: 'low', flagged: true, reviewStatus: 'pending', createdBy: user._id });

    const res = await request(app).post(`/api/review/${reading._id}/override`).set('Authorization', `Bearer ${token}`).send({ score: 2.5 });
    expect(res.status).toBe(200);

    const updated = await Reading.findById(reading._id);
    expect(updated.score).toBe(2.5);
    expect(updated.band).toBe('ideal');
    expect(updated.reviewStatus).toBe('overridden');
    expect(updated.flagged).toBe(false);

    const logs = await AuditLog.find({ reading: reading._id });
    expect(logs[0]).toMatchObject({ action: 'overridden', oldScore: 3.0, newScore: 2.5 });

    const updatedCow = await Cow.findById(cow._id);
    expect(updatedCow.latestScore).toBe(2.5);
  });

  it('rejects an override score that is not on the 0.25 grid', async () => {
    const user = await User.findOne();
    const reading = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, reviewStatus: 'pending', createdBy: user._id });
    const res = await request(app).post(`/api/review/${reading._id}/override`).set('Authorization', `Bearer ${token}`).send({ score: 2.6 });
    expect(res.status).toBe(400);
  });

  it('rejects an override score outside [1, 5]', async () => {
    const user = await User.findOne();
    const reading = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, reviewStatus: 'pending', createdBy: user._id });
    const res = await request(app).post(`/api/review/${reading._id}/override`).set('Authorization', `Bearer ${token}`).send({ score: 5.25 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/review/stats', () => {
  let app, token, cowA, cowB;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'stats@example.com', name: 'Stats', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cowA = await Cow.create({ cowId: '4004' });
    cowB = await Cow.create({ cowId: '4005' });
    const media = await Media.create({ storageKey: 'x.jpg', mimeType: 'image/jpeg', size: 1 });
    const r1 = await Reading.create({ cow: cowA._id, media: media._id, status: 'scored', score: 3.0, createdBy: user._id });
    const r2 = await Reading.create({ cow: cowB._id, media: media._id, status: 'scored', score: 3.0, createdBy: user._id });
    await AuditLog.create({ cow: cowA._id, reading: r1._id, user: user._id, action: 'approved', oldScore: 3.0, newScore: 3.0 });
    await AuditLog.create({ cow: cowB._id, reading: r2._id, user: user._id, action: 'overridden', oldScore: 3.0, newScore: 2.5 });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('computes reviewed/approved/overridden/cowsOverridden/overrideRate/avgAdjustment', async () => {
    const res = await request(app).get('/api/review/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reviewed: 2, approved: 1, overridden: 1, cowsOverridden: 1, overrideRate: 50, avgAdjustment: 0.5,
    });
  });
});
