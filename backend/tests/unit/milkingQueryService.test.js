const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility } = require('../helpers');
const Cow = require('../../src/models/Cow');
const CowGroup = require('../../src/models/CowGroup');
const { buildFacilityScopedMatch } = require('../../src/services/milkingQueryService');

describe('buildFacilityScopedMatch', () => {
  let facility, otherFacility;

  beforeAll(async () => { await connect(); });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  beforeEach(async () => {
    const created = await createOrgAndFacility();
    facility = created.facility;
    const otherCreated = await createOrgAndFacility({ orgName: 'Other Farm', facilityName: 'Other' });
    otherFacility = otherCreated.facility;
  });

  it('returns a match with the milkSessionAt range and cow: $in the facility\'s cow IDs when no cowId/groupId/shift given', async () => {
    const cow1 = await Cow.create({ cowsId: '1', facility: facility._id });
    const cow2 = await Cow.create({ cowsId: '2', facility: facility._id });
    const otherCow = await Cow.create({ cowsId: '1', facility: otherFacility._id });

    const match = await buildFacilityScopedMatch({
      facilityId: facility._id,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
    });

    expect(match.milkSessionAt).toEqual({
      $gte: new Date('2026-08-01T00:00:00.000Z'),
      $lte: new Date('2026-08-10T23:59:59.999Z'),
    });
    expect(match.cow.$in).toHaveLength(2);
    const inIds = match.cow.$in.map(String);
    expect(inIds).toEqual(expect.arrayContaining([String(cow1._id), String(cow2._id)]));
    expect(inIds).not.toContain(String(otherCow._id));
  });

  it('throws with status 400 when startDate is missing', async () => {
    await expect(
      buildFacilityScopedMatch({ facilityId: facility._id, endDate: '2026-08-10' })
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/startDate and endDate are required/) });
  });

  it('throws with status 400 for a malformed date', async () => {
    await expect(
      buildFacilityScopedMatch({ facilityId: facility._id, startDate: '08-01-2026', endDate: '2026-08-10' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws with status 400 when startDate is after endDate', async () => {
    await expect(
      buildFacilityScopedMatch({ facilityId: facility._id, startDate: '2026-08-10', endDate: '2026-08-01' })
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/must not be after/) });
  });

  it('returns match.cow set to the cow\'s _id when a valid cowId belonging to the facility is given', async () => {
    const cow = await Cow.create({ cowsId: '1', facility: facility._id });

    const match = await buildFacilityScopedMatch({
      facilityId: facility._id,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      cowId: String(cow._id),
    });

    expect(String(match.cow)).toBe(String(cow._id));
    expect(match.cow.$in).toBeUndefined();
  });

  it('throws with status 400 when cowId belongs to a different facility', async () => {
    const otherCow = await Cow.create({ cowsId: '1', facility: otherFacility._id });

    await expect(
      buildFacilityScopedMatch({
        facilityId: facility._id,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        cowId: String(otherCow._id),
      })
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/cowId does not belong/) });
  });

  it('throws with status 400 (not an uncaught CastError) when cowId is not a valid ObjectId string', async () => {
    await expect(
      buildFacilityScopedMatch({
        facilityId: facility._id,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        cowId: 'not-an-id',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns match.cowGroup set to the group\'s _id when a valid groupId belonging to the facility is given (no cowId)', async () => {
    const group = await CowGroup.create({ name: '2.1', facility: facility._id });

    const match = await buildFacilityScopedMatch({
      facilityId: facility._id,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      groupId: String(group._id),
    });

    expect(String(match.cowGroup)).toBe(String(group._id));
  });

  it('throws with status 400 when groupId belongs to a different facility', async () => {
    const otherGroup = await CowGroup.create({ name: '2.1', facility: otherFacility._id });

    await expect(
      buildFacilityScopedMatch({
        facilityId: facility._id,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        groupId: String(otherGroup._id),
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('prefers cowId over groupId when both are given', async () => {
    const cow = await Cow.create({ cowsId: '1', facility: facility._id });
    const group = await CowGroup.create({ name: '2.1', facility: facility._id });

    const match = await buildFacilityScopedMatch({
      facilityId: facility._id,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      cowId: String(cow._id),
      groupId: String(group._id),
    });

    expect(String(match.cow)).toBe(String(cow._id));
    expect(match.cowGroup).toBeUndefined();
  });

  it('sets match.milkingShift when a valid shift is given', async () => {
    const match = await buildFacilityScopedMatch({
      facilityId: facility._id,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      shift: 'Morning',
    });

    expect(match.milkingShift).toBe('Morning');
  });

  it('throws with status 400 for an invalid shift', async () => {
    await expect(
      buildFacilityScopedMatch({
        facilityId: facility._id,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        shift: 'Noon',
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
