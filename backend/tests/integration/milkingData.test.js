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
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const config = require('../../src/config/env');
const { triggerMilkingImport } = require('../../src/services/milkingImporterClient');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('POST /api/milking-data/upload-url', () => {
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'milking@example.com', name: 'Milking', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  it('returns a dateFolder/filename object path and a signed upload URL', async () => {
    const res = await request(app)
      .post('/api/milking-data/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'scr-2026-07-22.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBe('https://storage.googleapis.com/signed-put-url');
    expect(res.body.objectPath).toBe(`${res.body.dateFolder}/scr-2026-07-22.xlsx`);
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
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'import@example.com', name: 'Import', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  it('triggers the importer with the milking bucket and the given objectPath, returning its result', async () => {
    triggerMilkingImport.mockResolvedValue({ source: 'SCR', recordsInserted: 4 });

    const res = await request(app)
      .post('/api/milking-data/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ objectPath: '2026-07-22/scr.xlsx' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ source: 'SCR', recordsInserted: 4 });
    expect(triggerMilkingImport).toHaveBeenCalledWith({ bucketName: config.milking.bucketName, objectPath: '2026-07-22/scr.xlsx' });
  });

  it('surfaces a failed import as a non-2xx response rather than swallowing it', async () => {
    triggerMilkingImport.mockRejectedValue(new Error('milking-data-importer request failed (500): boom'));

    const res = await request(app)
      .post('/api/milking-data/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ objectPath: '2026-07-22/scr.xlsx' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects a malformed objectPath', async () => {
    const res = await request(app)
      .post('/api/milking-data/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ objectPath: '../../etc/passwd' });
    expect(res.status).toBe(400);
    expect(triggerMilkingImport).not.toHaveBeenCalled();
  });
});
