const request = require('supertest');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember } = require('../helpers');
const Cow = require('../../src/models/Cow');
const CowGroup = require('../../src/models/CowGroup');
const MilkingRecord = require('../../src/models/MilkingRecord');

describe('GET /api/milking-data/summary', () => {
  let app, token, organization, facility;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const created = await createOrgAndFacility();
    organization = created.organization;
    facility = created.facility;
    const member = await createMember({ email: 'summary@example.com', name: 'Summary', organization, facility, role: created.roles.staff });
    token = member.token;
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  function sessionAt(date, hour) {
    return new Date(`${date}T${hour}:00:00.000Z`);
  }

  function get(query) {
    return request(app)
      .get('/api/milking-data/summary')
      .set('Authorization', `Bearer ${token}`)
      .query(query);
  }

  it('returns correctly shaped daily and stats totals across multiple cows/dates/shifts', async () => {
    const cowA = await Cow.create({ cowsId: '101', facility: facility._id });
    const cowB = await Cow.create({ cowsId: '102', facility: facility._id });
    const group = await CowGroup.create({ name: '2.1', facility: facility._id });

    await MilkingRecord.create([
      { cow: cowA._id, cowGroup: group._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cowB._id, cowGroup: group._id, milkingShift: 'Morning', milk: 12, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cowA._id, cowGroup: group._id, milkingShift: 'Afternoon', milk: 8, milkSessionAt: sessionAt('2026-08-10', '13') },
      { cow: cowA._id, cowGroup: group._id, milkingShift: 'Evening', milk: 9, milkSessionAt: sessionAt('2026-08-11', '19') },
      { cow: cowB._id, cowGroup: group._id, milkingShift: 'Morning', milk: 11, milkSessionAt: sessionAt('2026-08-11', '05') },
    ]);

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11' });

    expect(res.status).toBe(200);
    expect(res.body.daily).toHaveLength(2);
    expect(res.body.daily.map((d) => d.date)).toEqual(['2026-08-10', '2026-08-11']);

    const day1 = res.body.daily[0];
    expect(day1.totalMilk).toBe(30);
    expect(day1.recordCount).toBe(3);
    expect(day1.byShift).toEqual({ Morning: 22, Afternoon: 8, Evening: 0 });

    const day2 = res.body.daily[1];
    expect(day2.totalMilk).toBe(20);
    expect(day2.recordCount).toBe(2);
    expect(day2.byShift).toEqual({ Morning: 11, Afternoon: 0, Evening: 9 });

    expect(res.body.stats.totalMilk).toBe(50);
    expect(res.body.stats.recordCount).toBe(5);
    expect(res.body.stats.cowsReporting).toBe(2);
    expect(res.body.stats.groupsActive).toBe(1);
    expect(res.body.stats.avgPerCow).toBe(25);
  });

  it('excludes records belonging to a different facility from grand totals', async () => {
    const cowA = await Cow.create({ cowsId: '201', facility: facility._id });
    await MilkingRecord.create({ cow: cowA._id, milkingShift: 'Morning', milk: 15, milkSessionAt: sessionAt('2026-08-10', '05') });

    const other = await createOrgAndFacility({ orgName: 'Other Farm', facilityName: 'Other Facility' });
    const otherCow = await Cow.create({ cowsId: '201', facility: other.facility._id });
    await MilkingRecord.create({ cow: otherCow._id, milkingShift: 'Morning', milk: 999, milkSessionAt: sessionAt('2026-08-10', '05') });

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11' });

    expect(res.status).toBe(200);
    expect(res.body.stats.totalMilk).toBe(15);
    expect(res.body.stats.recordCount).toBe(1);
    expect(res.body.stats.cowsReporting).toBe(1);
  });

  it('excludes records outside the requested date range', async () => {
    const cowA = await Cow.create({ cowsId: '301', facility: facility._id });
    await MilkingRecord.create([
      { cow: cowA._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cowA._id, milkingShift: 'Morning', milk: 100, milkSessionAt: sessionAt('2026-08-01', '05') },
    ]);

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11' });

    expect(res.status).toBe(200);
    expect(res.body.daily).toHaveLength(1);
    expect(res.body.stats.totalMilk).toBe(10);
    expect(res.body.stats.recordCount).toBe(1);
  });

  it('filters by groupId, counting only that group\'s records', async () => {
    const cowA = await Cow.create({ cowsId: '401', facility: facility._id });
    const cowB = await Cow.create({ cowsId: '402', facility: facility._id });
    const groupOne = await CowGroup.create({ name: '1.1', facility: facility._id });
    const groupTwo = await CowGroup.create({ name: '1.2', facility: facility._id });

    await MilkingRecord.create([
      { cow: cowA._id, cowGroup: groupOne._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cowB._id, cowGroup: groupTwo._id, milkingShift: 'Morning', milk: 20, milkSessionAt: sessionAt('2026-08-10', '05') },
    ]);

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11', groupId: String(groupOne._id) });

    expect(res.status).toBe(200);
    expect(res.body.daily).toHaveLength(1);
    expect(res.body.daily[0].totalMilk).toBe(10);
    expect(res.body.stats.totalMilk).toBe(10);
    expect(res.body.stats.recordCount).toBe(1);
    expect(res.body.stats.cowsReporting).toBe(1);
  });

  it('filters by shift, leaving other shifts at 0 in byShift', async () => {
    const cowA = await Cow.create({ cowsId: '501', facility: facility._id });
    await MilkingRecord.create([
      { cow: cowA._id, milkingShift: 'Morning', milk: 10, milkSessionAt: sessionAt('2026-08-10', '05') },
      { cow: cowA._id, milkingShift: 'Afternoon', milk: 7, milkSessionAt: sessionAt('2026-08-10', '13') },
    ]);

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11', shift: 'Morning' });

    expect(res.status).toBe(200);
    expect(res.body.daily).toHaveLength(1);
    expect(res.body.daily[0].byShift).toEqual({ Morning: 10, Afternoon: 0, Evening: 0 });
    expect(res.body.stats.totalMilk).toBe(10);
    expect(res.body.stats.recordCount).toBe(1);
  });

  it('returns 400 when startDate/endDate are missing', async () => {
    const res = await get({});
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it('returns 400 when cowId belongs to a different facility', async () => {
    const other = await createOrgAndFacility({ orgName: 'Cow Elsewhere', facilityName: 'Elsewhere Facility' });
    const otherCow = await Cow.create({ cowsId: '601', facility: other.facility._id });

    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11', cowId: String(otherCow._id) });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 200 with empty/zeroed shape when no records match the filters', async () => {
    const res = await get({ startDate: '2026-08-10', endDate: '2026-08-11' });

    expect(res.status).toBe(200);
    expect(res.body.daily).toEqual([]);
    expect(res.body.stats).toEqual({ totalMilk: 0, recordCount: 0, cowsReporting: 0, groupsActive: 0, avgPerCow: 0 });
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app)
      .get('/api/milking-data/summary')
      .query({ startDate: '2026-08-10', endDate: '2026-08-11' });

    expect(res.status).toBe(401);
  });
});
