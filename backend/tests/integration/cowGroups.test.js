const request = require('supertest');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember } = require('../helpers');
const CowGroup = require('../../src/models/CowGroup');

describe('GET /api/cow-groups', () => {
  let app, token, facility;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const created = await createOrgAndFacility();
    facility = created.facility;
    const member = await createMember({ email: 'groups@example.com', name: 'Groups', organization: created.organization, facility, role: created.roles.staff });
    token = member.token;
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('returns all cow groups for the caller\'s facility, sorted alphabetically by name', async () => {
    await CowGroup.create({ facility: facility._id, name: '3.3' });
    await CowGroup.create({ facility: facility._id, name: '1.1' });
    await CowGroup.create({ facility: facility._id, name: '2.1' });

    const res = await request(app).get('/api/cow-groups').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cowGroups.map((g) => g.name)).toEqual(['1.1', '2.1', '3.3']);
  });

  it('does not include cow groups from another facility', async () => {
    await CowGroup.create({ facility: facility._id, name: '1.1' });
    const other = await createOrgAndFacility();
    await CowGroup.create({ facility: other.facility._id, name: '9.9' });

    const res = await request(app).get('/api/cow-groups').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cowGroups.map((g) => g.name)).toEqual(['1.1']);
  });

  it('returns an empty list for a facility with no groups yet', async () => {
    const res = await request(app).get('/api/cow-groups').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cowGroups).toEqual([]);
  });

  it('rejects a request with no auth token', async () => {
    const res = await request(app).get('/api/cow-groups');
    expect(res.status).toBe(401);
  });
});
