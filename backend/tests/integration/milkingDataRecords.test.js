const request = require('supertest');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember } = require('../helpers');
const Cow = require('../../src/models/Cow');
const CowGroup = require('../../src/models/CowGroup');
const MilkingRecord = require('../../src/models/MilkingRecord');

describe('GET /api/milking-data/records', () => {
  let app, token, organization, facility;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const created = await createOrgAndFacility();
    organization = created.organization;
    facility = created.facility;
    const member = await createMember({ email: 'records@example.com', name: 'Records', organization, facility, role: created.roles.staff });
    token = member.token;
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  function sessionAt(date, hour) {
    return new Date(`${date}T${hour}:00:00.000Z`);
  }

  function get(query) {
    return request(app)
      .get('/api/milking-data/records')
      .set('Authorization', `Bearer ${token}`)
      .query(query);
  }

  it('returns correctly shaped, paginated records with populated cowsId', async () => {
    const cow = await Cow.create({ cowsId: '101', facility: facility._id });
    const group = await CowGroup.create({ name: '2.1', facility: facility._id });

    await MilkingRecord.create([
      { cow: cow._id, cowGroup: group._id, currentGroup: '2.1', milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cow._id, cowGroup: group._id, currentGroup: '2.1', milkingShift: 'Afternoon', milk: 11, milkSessionAt: sessionAt('2026-08-10', '13') },
      { cow: cow._id, cowGroup: group._id, currentGroup: '2.1', milkingShift: 'Evening', milk: 12, milkSessionAt: sessionAt('2026-08-10', '19') },
      { cow: cow._id, cowGroup: group._id, currentGroup: '2.1', milkingShift: 'Morning', milk: 13, milkSessionAt: sessionAt('2026-08-11', '05') },
      { cow: cow._id, cowGroup: group._id, currentGroup: '2.1', milkingShift: 'Afternoon', milk: 14, milkSessionAt: sessionAt('2026-08-11', '13') },
    ]);

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11', limit: 2, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.limit).toBe(2);
    expect(res.body.offset).toBe(0);

    const record = res.body.records[0];
    expect(Object.keys(record).sort()).toEqual(['cowsId', 'createdAt', 'currentGroup', 'id', 'milk', 'milkSessionAt', 'shift'].sort());
    expect(record.cowsId).toBe('101');
    expect(record.currentGroup).toBe('2.1');
  });

  it('paginates to page 2 with non-overlapping IDs, and the final partial page', async () => {
    const cow = await Cow.create({ cowsId: '201', facility: facility._id });

    await MilkingRecord.create([
      { cow: cow._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cow._id, milkingShift: 'Afternoon', milk: 11, milkSessionAt: sessionAt('2026-08-10', '13') },
      { cow: cow._id, milkingShift: 'Evening', milk: 12, milkSessionAt: sessionAt('2026-08-10', '19') },
      { cow: cow._id, milkingShift: 'Morning', milk: 13, milkSessionAt: sessionAt('2026-08-11', '05') },
      { cow: cow._id, milkingShift: 'Afternoon', milk: 14, milkSessionAt: sessionAt('2026-08-11', '13') },
    ]);

    const page1 = await get({ startDate: '2026-08-10', endDate: '2026-08-11', limit: 2, offset: 0 });
    const page2 = await get({ startDate: '2026-08-10', endDate: '2026-08-11', limit: 2, offset: 2 });
    const page3 = await get({ startDate: '2026-08-10', endDate: '2026-08-11', limit: 2, offset: 4 });

    expect(page2.status).toBe(200);
    expect(page2.body.records).toHaveLength(2);
    const page1Ids = page1.body.records.map((r) => r.id);
    const page2Ids = page2.body.records.map((r) => r.id);
    expect(page2Ids.some((id) => page1Ids.includes(id))).toBe(false);

    expect(page3.status).toBe(200);
    expect(page3.body.records).toHaveLength(1);
  });

  it('defaults to sorting by milkSessionAt descending (most recent first)', async () => {
    const cow = await Cow.create({ cowsId: '301', facility: facility._id });

    await MilkingRecord.create([
      { cow: cow._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cow._id, milkingShift: 'Morning', milk: 20, milkSessionAt: sessionAt('2026-08-12', '05') },
      { cow: cow._id, milkingShift: 'Morning', milk: 30, milkSessionAt: sessionAt('2026-08-11', '05') },
    ]);

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-12' });

    expect(res.status).toBe(200);
    expect(res.body.records.map((r) => r.milk)).toEqual([20, 30, 10]);
  });

  it('sorts by milk ascending when sortBy=milk&sortOrder=asc', async () => {
    const cow = await Cow.create({ cowsId: '401', facility: facility._id });

    await MilkingRecord.create([
      { cow: cow._id, milkingShift: 'Morning', milk: 30, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cow._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-11', '05') },
      { cow: cow._id, milkingShift: 'Morning', milk: 20, milkSessionAt: sessionAt('2026-08-12', '05') },
    ]);

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-12', sortBy: 'milk', sortOrder: 'asc' });

    expect(res.status).toBe(200);
    expect(res.body.records.map((r) => r.milk)).toEqual([10, 20, 30]);
  });

  it('returns 400 for an invalid sortBy', async () => {
    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11', sortBy: 'bogus' });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 400 for an invalid sortOrder', async () => {
    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11', sortOrder: 'sideways' });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('clamps limit to 500 when a larger value is requested', async () => {
    const cow = await Cow.create({ cowsId: '501', facility: facility._id });
    await MilkingRecord.create({ cow: cow._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') });

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11', limit: 9999 });

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(500);
  });

  it('defaults limit to 50 and offset to 0 when omitted', async () => {
    const cow = await Cow.create({ cowsId: '601', facility: facility._id });
    await MilkingRecord.create({ cow: cow._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') });

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11' });

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(50);
    expect(res.body.offset).toBe(0);
  });

  it('excludes records belonging to a different facility', async () => {
    const cowA = await Cow.create({ cowsId: '701', facility: facility._id });
    await MilkingRecord.create({ cow: cowA._id, milkingShift: 'Morning', milk: 15, milkSessionAt: sessionAt('2026-08-10', '05') });

    const other = await createOrgAndFacility({ orgName: 'Other Farm', facilityName: 'Other Facility' });
    const otherCow = await Cow.create({ cowsId: '701', facility: other.facility._id });
    await MilkingRecord.create({ cow: otherCow._id, milkingShift: 'Morning', milk: 999, milkSessionAt: sessionAt('2026-08-10', '05') });

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].milk).toBe(15);
  });

  it('filters by groupId, cowId, and shift', async () => {
    const cowA = await Cow.create({ cowsId: '801', facility: facility._id });
    const cowB = await Cow.create({ cowsId: '802', facility: facility._id });
    const groupOne = await CowGroup.create({ name: '1.1', facility: facility._id });
    const groupTwo = await CowGroup.create({ name: '1.2', facility: facility._id });

    await MilkingRecord.create([
      { cow: cowA._id, cowGroup: groupOne._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cowA._id, cowGroup: groupOne._id, milkingShift: 'Afternoon', milk: 11, milkSessionAt: sessionAt('2026-08-10', '13') },
      { cow: cowB._id, cowGroup: groupTwo._id, milkingShift: 'Morning', milk: 20, milkSessionAt: sessionAt('2026-08-10', '05') },
    ]);

    const byGroup = await get({ startDate: '2026-08-10', endDate: '2026-08-11', groupId: String(groupOne._id) });
    expect(byGroup.status).toBe(200);
    expect(byGroup.body.total).toBe(2);
    expect(byGroup.body.records.every((r) => r.milk === 10 || r.milk === 11)).toBe(true);

    const byCow = await get({ startDate: '2026-08-10', endDate: '2026-08-11', cowId: String(cowB._id) });
    expect(byCow.status).toBe(200);
    expect(byCow.body.total).toBe(1);
    expect(byCow.body.records[0].milk).toBe(20);

    const byShift = await get({ startDate: '2026-08-10', endDate: '2026-08-11', shift: 'Afternoon' });
    expect(byShift.status).toBe(200);
    expect(byShift.body.total).toBe(1);
    expect(byShift.body.records[0].milk).toBe(11);
  });

  it('returns 200 with an empty records array and total 0 when nothing matches', async () => {
    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11' });

    expect(res.status).toBe(200);
    expect(res.body.records).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app)
      .get('/api/milking-data/records')
      .query({ startDate: '2026-08-10', endDate: '2026-08-11' });

    expect(res.status).toBe(401);
  });
});
