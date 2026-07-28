const request = require('supertest');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember } = require('../helpers');
const Role = require('../../src/models/Role');

describe('GET /api/roles', () => {
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const { organization, facility, roles } = await createOrgAndFacility();
    const member = await createMember({ email: 'roles@example.com', name: 'Roles', organization, facility, role: roles.staff });
    token = member.token;
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('lists the 3 platform-default roles', async () => {
    const res = await request(app).get('/api/roles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.roles.map((r) => r.name).sort()).toEqual(['Facility-Admin', 'Org-Admin', 'Staff']);
  });

  it('also includes a custom role scoped to the caller\'s own organization', async () => {
    const { organization, facility, roles } = await createOrgAndFacility();
    const custom = await Role.create({ organization: organization._id, name: 'Vet', permissions: [] });
    const member = await createMember({ email: 'roles2@example.com', name: 'Roles2', organization, facility, role: roles.staff });

    const res = await request(app).get('/api/roles').set('Authorization', `Bearer ${member.token}`);
    expect(res.body.roles.map((r) => r.name)).toContain('Vet');
    expect(res.body.roles.map((r) => r.id)).toContain(custom._id.toString());
  });

  it('does not include a custom role scoped to a different organization', async () => {
    const other = await createOrgAndFacility();
    await Role.create({ organization: other.organization._id, name: 'Farm B Only Role', permissions: [] });

    const res = await request(app).get('/api/roles').set('Authorization', `Bearer ${token}`);
    expect(res.body.roles.map((r) => r.name)).not.toContain('Farm B Only Role');
  });
});
