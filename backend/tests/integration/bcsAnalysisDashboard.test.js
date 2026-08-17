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

// GET /bcs-analysis/dashboard-summary replaced a client-side fan-out that
// fired one /cows/:cowsId/analyses request PER COW in the herd, each of
// which generated 3 signed GCS URLs per image via serializeBcsAnalysis -
// most of it for image URLs the Dashboard's charts never render. This
// endpoint proves the fix: one query, no signed-URL generation at all.
describe('GET /api/bcs-analysis/dashboard-summary', () => {
  let app, token, organization, facility, roles, user;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const created = await createOrgAndFacility();
    organization = created.organization;
    facility = created.facility;
    roles = created.roles;
    const member = await createMember({ email: 'dash@example.com', name: 'Dash', organization, facility, role: roles.staff });
    token = member.token;
    user = member.user;
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  async function createAnalysis(cow, overrides = {}) {
    return BcsAnalysis.create({
      cow: cow._id,
      organization: organization._id,
      facility: facility._id,
      cowsImages: ['gs://bucket/a.jpg'],
      status: 'completed',
      finalBcs: 3,
      bcsScore: { isCritical: false },
      isApproved: false,
      createdBy: user._id,
      updatedBy: user._id,
      ...overrides,
    });
  }

  it('returns lightweight fields for every analysis in the facility, with no image URLs', async () => {
    const cow232 = await Cow.create({ facility: facility._id, cowsId: '232' });
    const cow1067 = await Cow.create({ facility: facility._id, cowsId: '1067' });
    await createAnalysis(cow232, { finalBcs: 3.5, isApproved: true });
    await createAnalysis(cow1067, { status: 'processing', finalBcs: null });

    const res = await request(app)
      .get('/api/bcs-analysis/dashboard-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.analyses).toHaveLength(2);

    const byCow = Object.fromEntries(res.body.analyses.map((a) => [a.cowsId, a]));
    expect(byCow['232']).toMatchObject({ status: 'completed', finalBcs: 3.5, isApproved: true });
    expect(byCow['1067']).toMatchObject({ status: 'processing', finalBcs: null });

    for (const a of res.body.analyses) {
      expect(a).not.toHaveProperty('cowsImages');
      expect(a).not.toHaveProperty('imageUrls');
      expect(a).not.toHaveProperty('thumbnailUrls');
      expect(a).not.toHaveProperty('displayUrls');
    }
  });

  it('never generates a signed GCS URL - the whole point of this endpoint', async () => {
    const cow = await Cow.create({ facility: facility._id, cowsId: '5' });
    await createAnalysis(cow);

    await request(app).get('/api/bcs-analysis/dashboard-summary').set('Authorization', `Bearer ${token}`);

    expect(generateReadUrl).not.toHaveBeenCalled();
  });

  it('excludes analyses from a different facility', async () => {
    const cow = await Cow.create({ facility: facility._id, cowsId: '5' });
    await createAnalysis(cow);

    const other = await createOrgAndFacility({ orgName: 'Other Farm', facilityName: 'Other' });
    const otherCow = await Cow.create({ facility: other.facility._id, cowsId: '5' });
    await BcsAnalysis.create({
      cow: otherCow._id,
      organization: other.organization._id,
      facility: other.facility._id,
      cowsImages: ['gs://bucket/b.jpg'],
      status: 'completed',
      finalBcs: 4,
      createdBy: user._id,
      updatedBy: user._id,
    });

    const res = await request(app)
      .get('/api/bcs-analysis/dashboard-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.analyses).toHaveLength(1);
  });

  it('returns an empty array, not an error, for a facility with no analyses yet', async () => {
    const res = await request(app)
      .get('/api/bcs-analysis/dashboard-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ analyses: [] });
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/bcs-analysis/dashboard-summary');
    expect(res.status).toBe(401);
  });
});
