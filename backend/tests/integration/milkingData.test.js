jest.mock('../../src/services/milkingGcsService', () => {
  const actual = jest.requireActual('../../src/services/milkingGcsService');
  return {
    ...actual,
    generateMilkingUploadUrl: jest.fn().mockResolvedValue('https://storage.googleapis.com/signed-put-url'),
  };
});
jest.mock('../../src/services/milkingImporterClient', () => ({
  triggerMilkingImport: jest.fn(),
}));

const request = require('supertest');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember } = require('../helpers');
const config = require('../../src/config/env');
const { triggerMilkingImport } = require('../../src/services/milkingImporterClient');

describe('POST /api/milking-data/upload-url', () => {
  let app, token, organization, facility;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const created = await createOrgAndFacility();
    organization = created.organization;
    facility = created.facility;
    const member = await createMember({ email: 'milking@example.com', name: 'Milking', organization, facility, role: created.roles.staff });
    token = member.token;
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  it('returns an organizationId/facilityId/dateFolder/filename object path and a signed upload URL', async () => {
    const res = await request(app)
      .post('/api/milking-data/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'scr-2026-07-22.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBe('https://storage.googleapis.com/signed-put-url');
    expect(res.body.objectPath).toBe(`${organization._id}/${facility._id}/${res.body.dateFolder}/scr-2026-07-22.xlsx`);
    expect(res.body.gsUri).toBe(`gs://${config.milking.bucketName}/${res.body.objectPath}`);
  });

  it('rejects a non-xlsx content type', async () => {
    const res = await request(app)
      .post('/api/milking-data/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'scr.xlsx', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/milking-data/import', () => {
  let app, token, organization, facility;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const created = await createOrgAndFacility();
    organization = created.organization;
    facility = created.facility;
    const member = await createMember({ email: 'import@example.com', name: 'Import', organization, facility, role: created.roles.staff });
    token = member.token;
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  function objectPath() {
    return `${organization._id}/${facility._id}/2026-07-22/scr.xlsx`;
  }

  it('triggers the importer with the milking bucket, objectPath, and the caller\'s own organizationId/facilityId, returning its result', async () => {
    triggerMilkingImport.mockResolvedValue({ source: 'SCR', recordsInserted: 4 });

    const res = await request(app)
      .post('/api/milking-data/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ objectPath: objectPath() });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ source: 'SCR', recordsInserted: 4 });
    expect(triggerMilkingImport).toHaveBeenCalledWith({
      bucketName: config.milking.bucketName,
      objectPath: objectPath(),
      organizationId: organization._id.toString(),
      facilityId: facility._id.toString(),
    });
  });

  it('surfaces a failed import as a non-2xx response rather than swallowing it', async () => {
    triggerMilkingImport.mockRejectedValue(new Error('milking-data-importer request failed (500): boom'));

    const res = await request(app)
      .post('/api/milking-data/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ objectPath: objectPath() });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('passes a bad-file validation error through to the user as its own meaningful message, not a generic one', async () => {
    const err = new Error(
      'This file is missing the Cow Number for row 3. Please fill in the Cow Number for every row and re-upload the file. No records were imported.'
    );
    err.status = 400;
    triggerMilkingImport.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/milking-data/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ objectPath: objectPath() });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      'This file is missing the Cow Number for row 3. Please fill in the Cow Number for every row and re-upload the file. No records were imported.'
    );
  });

  it('rejects an objectPath with the wrong number of segments', async () => {
    const res = await request(app)
      .post('/api/milking-data/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ objectPath: '2026-07-22/scr.xlsx' }); // missing the organizationId/facilityId prefix segments
    expect(res.status).toBe(400);
    expect(triggerMilkingImport).not.toHaveBeenCalled();
  });
});
