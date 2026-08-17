jest.mock('../../src/services/gcsService', () => {
  const actual = jest.requireActual('../../src/services/gcsService');
  return {
    ...actual,
    generateReadUrl: jest.fn().mockResolvedValue('https://storage.googleapis.com/signed-get-url'),
  };
});

const request = require('supertest');
const { generateReadUrl } = require('../../src/services/gcsService');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember } = require('../helpers');
const Cow = require('../../src/models/Cow');
const BcsAnalysis = require('../../src/models/BcsAnalysis');

describe('Cow CRUD', () => {
  let app;
  beforeAll(async () => { await connect(); app = createApp(); });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  let memberCounter = 0;
  async function memberToken() {
    memberCounter += 1;
    const { organization, facility, roles } = await createOrgAndFacility();
    const { token } = await createMember({
      email: `staff${memberCounter}@example.com`,
      name: 'Staff',
      organization,
      facility,
      role: roles.staff,
    });
    return { token, facility };
  }

  it('creates a cow, defaulting isActive to true', async () => {
    const { token, facility } = await memberToken();
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({ cowsId: '4417' });
    expect(res.status).toBe(201);
    expect(res.body.cow.cowsId).toBe('4417');
    expect(res.body.cow.isActive).toBe(true);
    expect(await Cow.countDocuments({ facility: facility._id })).toBe(1);
  });

  it('rejects a duplicate cowsId within the same facility', async () => {
    const { token, facility } = await memberToken();
    await Cow.create({ facility: facility._id, cowsId: '4417' });
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({ cowsId: '4417' });
    expect(res.status).toBe(409);
  });

  it('allows the same cowsId across two different facilities', async () => {
    const { facility: facility1 } = await memberToken();
    await Cow.create({ facility: facility1._id, cowsId: '4417' });
    const { token: token2 } = await memberToken();
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token2}`).send({ cowsId: '4417' });
    expect(res.status).toBe(201);
  });

  it('gets a cow by cowsId', async () => {
    const { token, facility } = await memberToken();
    await Cow.create({ facility: facility._id, cowsId: '4417' });
    const res = await request(app).get('/api/cows/4417').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cow.cowsId).toBe('4417');
  });

  it('returns 404 for an unknown cowsId', async () => {
    const { token: t } = await memberToken();
    const res = await request(app).get('/api/cows/9999').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/cows (herd list)', () => {
  let app, token, facility, organization, userId;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const created = await createOrgAndFacility();
    organization = created.organization;
    facility = created.facility;
    const member = await createMember({ email: 'herd@example.com', name: 'Herd', organization, facility, role: created.roles.staff });
    token = member.token;
    userId = member.user._id;
    await Cow.create({ facility: facility._id, cowsId: '1001' });
    await Cow.create({ facility: facility._id, cowsId: '1002' });
    await Cow.create({ facility: facility._id, cowsId: '1003' });
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

  it('lite=true returns a minimal id/cowsId shape without triggering BcsAnalysis aggregation or signed URLs (Finding 4)', async () => {
    generateReadUrl.mockClear();
    const res = await request(app).get('/api/cows?lite=true').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.cows.map((c) => c.cowsId).sort()).toEqual(['1001', '1002', '1003']);
    for (const cow of res.body.cows) {
      expect(Object.keys(cow).sort()).toEqual(['cowsId', 'id']);
      expect(cow).not.toHaveProperty('latestBcsScore');
      expect(cow).not.toHaveProperty('latestAnalysisThumbnailUrl');
    }
    // No per-cow GCS signed-URL generation in lite mode.
    expect(generateReadUrl).not.toHaveBeenCalled();
  });

  it('lite=true defaults to a higher effective limit than the normal 100-cow cap', async () => {
    await Cow.insertMany(
      Array.from({ length: 150 }, (_, i) => ({ facility: facility._id, cowsId: `lite-${i}` }))
    );

    const res = await request(app).get('/api/cows?lite=true').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.cows.length).toBeGreaterThan(100);
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
    const cow = await Cow.findOne({ facility: facility._id, cowsId: '1002' });
    await BcsAnalysis.create({
      cow: cow._id,
      organization: organization._id,
      facility: facility._id,
      cowsImages: ['gs://bucket/1002/2026-07-16T00-00-00-000Z/a.jpg', 'gs://bucket/1002/2026-07-16T00-00-00-000Z/b.jpg'],
      status: 'completed', createdBy: userId, updatedBy: userId,
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
    const cow = await Cow.findOne({ facility: facility._id, cowsId: '1002' });
    await BcsAnalysis.create({
      cow: cow._id, organization: organization._id, facility: facility._id, cowsImages: ['gs://bucket/1002/ts/a.jpg'],
      status: 'processing', createdBy: userId, updatedBy: userId,
    });
    await new Promise((r) => setTimeout(r, 10));
    await BcsAnalysis.create({
      cow: cow._id, organization: organization._id, facility: facility._id, cowsImages: ['gs://bucket/1002/ts2/b.jpg'],
      status: 'completed', createdBy: userId, updatedBy: userId,
    });

    const res = await request(app).get('/api/cows?search=1002').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestAnalysisStatus).toBe('completed');
  });

  it('surfaces whether the most recent analysis has been approved', async () => {
    const cow = await Cow.findOne({ facility: facility._id, cowsId: '1003' });
    await BcsAnalysis.create({
      cow: cow._id, organization: organization._id, facility: facility._id, cowsImages: ['gs://bucket/1003/ts/a.jpg'],
      status: 'completed', isApproved: true, createdBy: userId, updatedBy: userId,
    });

    const res = await request(app).get('/api/cows?search=1003').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestAnalysisIsApproved).toBe(true);
  });

  it('defaults latestAnalysisIsApproved to false for a completed-but-unreviewed analysis', async () => {
    const cow = await Cow.findOne({ facility: facility._id, cowsId: '1001' });
    await BcsAnalysis.create({
      cow: cow._id, organization: organization._id, facility: facility._id, cowsImages: ['gs://bucket/1001/ts/a.jpg'],
      status: 'completed', createdBy: userId, updatedBy: userId,
    });

    const res = await request(app).get('/api/cows?search=1001').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestAnalysisIsApproved).toBe(false);
  });

  it('surfaces finalBcs as the latest BCS score once reviewed', async () => {
    const cow = await Cow.findOne({ facility: facility._id, cowsId: '1002' });
    await BcsAnalysis.create({
      cow: cow._id, organization: organization._id, facility: facility._id, cowsImages: ['gs://bucket/1002/ts/a.jpg'],
      status: 'completed', isApproved: true, finalBcs: 3.25,
      bcsScore: { gemini: { finalBcs: 3.0, status: 'success' } },
      createdBy: userId, updatedBy: userId,
    });

    const res = await request(app).get('/api/cows?search=1002').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows[0].latestBcsScore).toBe(3.25);
  });

  it('falls back to the computed median for the latest BCS score before a review decision', async () => {
    const cow = await Cow.findOne({ facility: facility._id, cowsId: '1003' });
    await BcsAnalysis.create({
      cow: cow._id, organization: organization._id, facility: facility._id,
      cowsImages: ['gs://bucket/1003/ts/a.jpg'],
      status: 'completed',
      bcsScore: { gemini: { finalBcs: 3.0, status: 'success' }, claude: { finalBcs: 3.5, status: 'success' } },
      createdBy: userId, updatedBy: userId,
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
  let app, token, cow;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const { organization, facility, roles } = await createOrgAndFacility();
    const created = await createMember({ email: 'hist@example.com', name: 'Hist', organization, facility, role: roles.staff });
    token = created.token;
    cow = await Cow.create({ facility: facility._id, cowsId: '2002' });
    await BcsAnalysis.create({
      cow: cow._id,
      organization: organization._id,
      facility: facility._id,
      cowsImages: ['gs://bucket/2002/2026-07-01T00-00-00-000Z/a.jpg'],
      status: 'completed',
      bcsScore: { gemini: { finalBcs: 3.0 } },
      createdBy: created.user._id,
      updatedBy: created.user._id,
    });
    await new Promise((r) => setTimeout(r, 10));
    await BcsAnalysis.create({
      cow: cow._id,
      organization: organization._id,
      facility: facility._id,
      cowsImages: ['gs://bucket/2002/2026-07-10T00-00-00-000Z/b.jpg'],
      status: 'not_started',
      createdBy: created.user._id,
      updatedBy: created.user._id,
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
