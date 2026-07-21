jest.mock('../../src/services/gcsService', () => {
  const actual = jest.requireActual('../../src/services/gcsService');
  return {
    ...actual,
    generateReadUrl: jest.fn().mockResolvedValue('https://storage.googleapis.com/signed-get-url'),
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { generateReadUrl } = require('../../src/services/gcsService');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const BcsAnalysis = require('../../src/models/BcsAnalysis');
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

  it('creates a cow, defaulting isActive to true', async () => {
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({ cowsId: '4417' });
    expect(res.status).toBe(201);
    expect(res.body.cow.cowsId).toBe('4417');
    expect(res.body.cow.isActive).toBe(true);
  });

  it('rejects a duplicate cowsId', async () => {
    await Cow.create({ cowsId: '4417' });
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({ cowsId: '4417' });
    expect(res.status).toBe(409);
  });

  it('gets a cow by cowsId', async () => {
    await Cow.create({ cowsId: '4417' });
    const res = await request(app).get('/api/cows/4417').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cow.cowsId).toBe('4417');
  });

  it('returns 404 for an unknown cowsId', async () => {
    const res = await request(app).get('/api/cows/9999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/cows (herd list)', () => {
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'herd@example.com', name: 'Herd', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    await Cow.create({ cowsId: '1001' });
    await Cow.create({ cowsId: '1002' });
    await Cow.create({ cowsId: '1003' });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('lists all cows', async () => {
    const res = await request(app).get('/api/cows').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.cows.map((c) => c.cowsId).sort()).toEqual(['1001', '1002', '1003']);
  });

  it('searches by cowsId substring', async () => {
    const res = await request(app).get('/api/cows?search=100').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows.length).toBe(3);
    const res2 = await request(app).get('/api/cows?search=1002').set('Authorization', `Bearer ${token}`);
    expect(res2.body.cows.map((c) => c.cowsId)).toEqual(['1002']);
  });

  it('has no latestAnalysisStatus for a cow with no uploads yet', async () => {
    const res = await request(app).get('/api/cows?search=1001').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestAnalysisStatus).toBeNull();
  });

  it('has no thumbnail/image URLs for a cow with no uploads yet', async () => {
    const res = await request(app).get('/api/cows?search=1001').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestAnalysisThumbnailUrl).toBeNull();
    expect(res.body.cows[0].latestAnalysisImageUrl).toBeNull();
  });

  it('signs a thumbnail and original image URL from the latest analysis\'s first photo', async () => {
    const user = await User.findOne({ email: 'herd@example.com' });
    const cow = await Cow.findOne({ cowsId: '1002' });
    await BcsAnalysis.create({
      cow: cow._id, cowsId: cow.cowsId,
      cowsImages: ['gs://bucket/1002/2026-07-16T00-00-00-000Z/a.jpg', 'gs://bucket/1002/2026-07-16T00-00-00-000Z/b.jpg'],
      status: 'completed', createdBy: user._id, updatedBy: user._id,
    });

    generateReadUrl.mockClear();
    const res = await request(app).get('/api/cows?search=1002').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestAnalysisThumbnailUrl).toBe('https://storage.googleapis.com/signed-get-url');
    expect(res.body.cows[0].latestAnalysisImageUrl).toBe('https://storage.googleapis.com/signed-get-url');

    // Only the first photo is used for the card cover, as its 300X300
    // variant path alongside the original - never the second photo.
    const calledPaths = generateReadUrl.mock.calls.map(([{ objectPath }]) => objectPath);
    expect(calledPaths).toContain('1002/2026-07-16T00-00-00-000Z/300X300/a.jpg');
    expect(calledPaths).toContain('1002/2026-07-16T00-00-00-000Z/a.jpg');
    expect(calledPaths.some((p) => p.includes('/b.jpg'))).toBe(false);
  });

  it('surfaces the most recent analysis status per cow', async () => {
    const user = await User.findOne({ email: 'herd@example.com' });
    const cow = await Cow.findOne({ cowsId: '1002' });
    await BcsAnalysis.create({
      cow: cow._id, cowsId: cow.cowsId, cowsImages: ['gs://bucket/1002/ts/a.jpg'],
      status: 'processing', createdBy: user._id, updatedBy: user._id,
    });
    await new Promise((r) => setTimeout(r, 10));
    await BcsAnalysis.create({
      cow: cow._id, cowsId: cow.cowsId, cowsImages: ['gs://bucket/1002/ts2/b.jpg'],
      status: 'completed', createdBy: user._id, updatedBy: user._id,
    });

    const res = await request(app).get('/api/cows?search=1002').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestAnalysisStatus).toBe('completed');
  });

  it('surfaces whether the most recent analysis has been approved', async () => {
    const user = await User.findOne({ email: 'herd@example.com' });
    const cow = await Cow.findOne({ cowsId: '1003' });
    await BcsAnalysis.create({
      cow: cow._id, cowsId: cow.cowsId, cowsImages: ['gs://bucket/1003/ts/a.jpg'],
      status: 'completed', is_approved: true, createdBy: user._id, updatedBy: user._id,
    });

    const res = await request(app).get('/api/cows?search=1003').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestAnalysisIsApproved).toBe(true);
  });

  it('defaults latestAnalysisIsApproved to false for a completed-but-unreviewed analysis', async () => {
    const user = await User.findOne({ email: 'herd@example.com' });
    const cow = await Cow.findOne({ cowsId: '1001' });
    await BcsAnalysis.create({
      cow: cow._id, cowsId: cow.cowsId, cowsImages: ['gs://bucket/1001/ts/a.jpg'],
      status: 'completed', createdBy: user._id, updatedBy: user._id,
    });

    const res = await request(app).get('/api/cows?search=1001').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestAnalysisIsApproved).toBe(false);
  });

  it('surfaces final_bcs as the latest BCS score once reviewed', async () => {
    const user = await User.findOne({ email: 'herd@example.com' });
    const cow = await Cow.findOne({ cowsId: '1002' });
    await BcsAnalysis.create({
      cow: cow._id, cowsId: cow.cowsId, cowsImages: ['gs://bucket/1002/ts/a.jpg'],
      status: 'completed', is_approved: true, final_bcs: 3.25,
      bcsScore: { gemini: { final_bcs: 3.0, status: 'success' } },
      createdBy: user._id, updatedBy: user._id,
    });

    const res = await request(app).get('/api/cows?search=1002').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestBcsScore).toBe(3.25);
  });

  it('falls back to the computed median for the latest BCS score before a review decision', async () => {
    const user = await User.findOne({ email: 'herd@example.com' });
    const cow = await Cow.findOne({ cowsId: '1003' });
    await BcsAnalysis.create({
      cow: cow._id, cowsId: cow.cowsId, cowsImages: ['gs://bucket/1003/ts/a.jpg'],
      status: 'completed',
      bcsScore: { gemini: { final_bcs: 3.0, status: 'success' }, claude: { final_bcs: 3.5, status: 'success' } },
      createdBy: user._id, updatedBy: user._id,
    });

    const res = await request(app).get('/api/cows?search=1003').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestBcsScore).toBe(3.25);
  });

  it('has a null latest BCS score for a cow with no uploads yet', async () => {
    const res = await request(app).get('/api/cows?search=1001').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestBcsScore).toBeNull();
  });
});

describe('GET /api/cows/:cowsId/analyses', () => {
  let app, token, cow, user;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    user = await User.create({ email: 'hist@example.com', name: 'Hist', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowsId: '2002' });
    await BcsAnalysis.create({
      cow: cow._id,
      cowsId: cow.cowsId,
      cowsImages: ['gs://bucket/2002/2026-07-01T00-00-00-000Z/a.jpg'],
      status: 'completed',
      bcsScore: { gemini: { final_bcs: 3.0 } },
      createdBy: user._id,
      updatedBy: user._id,
    });
    await new Promise((r) => setTimeout(r, 10));
    await BcsAnalysis.create({
      cow: cow._id,
      cowsId: cow.cowsId,
      cowsImages: ['gs://bucket/2002/2026-07-10T00-00-00-000Z/b.jpg'],
      status: 'not_started',
      createdBy: user._id,
      updatedBy: user._id,
    });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('returns bcs analyses for a cow, most recent first', async () => {
    const res = await request(app).get(`/api/cows/${cow.cowsId}/analyses`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bcsAnalyses.length).toBe(2);
    expect(res.body.bcsAnalyses[0].status).toBe('not_started');
    expect(res.body.bcsAnalyses[1].status).toBe('completed');
  });
});
