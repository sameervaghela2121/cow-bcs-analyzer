const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const Reading = require('../../src/models/Reading');
const Media = require('../../src/models/Media');
const config = require('../../src/config/env');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('Cow CRUD', () => {
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'staff@example.com', name: 'Staff', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('creates a cow', async () => {
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({
      cowId: '4417', breed: 'Holstein', lactation: 'Mid', pen: 'Pen 1',
    });
    expect(res.status).toBe(201);
    expect(res.body.cow.cowId).toBe('4417');
  });

  it('rejects a duplicate cowId', async () => {
    await Cow.create({ cowId: '4417' });
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({ cowId: '4417' });
    expect(res.status).toBe(409);
  });

  it('gets a cow by cowId', async () => {
    await Cow.create({ cowId: '4417', breed: 'Jersey' });
    const res = await request(app).get('/api/cows/4417').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cow.breed).toBe('Jersey');
  });

  it('returns 404 for an unknown cowId', async () => {
    const res = await request(app).get('/api/cows/9999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('updates a cow', async () => {
    await Cow.create({ cowId: '4417', pen: 'Pen 1' });
    const res = await request(app).patch('/api/cows/4417').set('Authorization', `Bearer ${token}`).send({ pen: 'Pen 2' });
    expect(res.status).toBe(200);
    expect(res.body.cow.pen).toBe('Pen 2');
  });
});

describe('GET /api/cows (herd list)', () => {
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'herd@example.com', name: 'Herd', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    await Cow.create({ cowId: '1001', latestScore: 2.0, latestBand: 'thin', flagged: false, lastScoredAt: new Date('2026-07-01') });
    await Cow.create({ cowId: '1002', latestScore: 3.5, latestBand: 'ideal', flagged: true, lastScoredAt: new Date('2026-07-10') });
    await Cow.create({ cowId: '1003', latestScore: 4.5, latestBand: 'heavy', flagged: false, lastScoredAt: new Date('2026-07-05') });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('lists all cows sorted by most recently scored by default', async () => {
    const res = await request(app).get('/api/cows').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cows.map((c) => c.cowId)).toEqual(['1002', '1003', '1001']);
    expect(res.body.total).toBe(3);
  });

  it('filters by flagged', async () => {
    const res = await request(app).get('/api/cows?filter=flagged').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows.map((c) => c.cowId)).toEqual(['1002']);
  });

  it('filters by band', async () => {
    const res = await request(app).get('/api/cows?filter=thin').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows.map((c) => c.cowId)).toEqual(['1001']);
  });

  it('searches by cowId substring', async () => {
    const res = await request(app).get('/api/cows?search=100').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows.length).toBe(3);
    const res2 = await request(app).get('/api/cows?search=1002').set('Authorization', `Bearer ${token}`);
    expect(res2.body.cows.map((c) => c.cowId)).toEqual(['1002']);
  });

  it('sorts bcs-asc', async () => {
    const res = await request(app).get('/api/cows?sort=bcs-asc').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows.map((c) => c.cowId)).toEqual(['1001', '1002', '1003']);
  });
});

describe('GET /api/cows/:cowId/readings', () => {
  let app, token, cow;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'hist@example.com', name: 'Hist', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowId: '2002' });
    const media = await Media.create({ storageKey: 'x.jpg', mimeType: 'image/jpeg', size: 1 });
    await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, band: 'ideal', confidence: 'high', capturedAt: new Date('2026-07-01'), createdBy: user._id });
    await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.25, band: 'ideal', confidence: 'high', capturedAt: new Date('2026-07-10'), createdBy: user._id });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('returns readings for a cow, most recent first', async () => {
    const res = await request(app).get(`/api/cows/${cow.cowId}/readings`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.readings.length).toBe(2);
    expect(res.body.readings[0].score).toBe(3.25);
  });
});
