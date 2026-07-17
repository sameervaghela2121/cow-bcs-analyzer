jest.mock('../../src/services/gcsService', () => {
  const actual = jest.requireActual('../../src/services/gcsService');
  return {
    ...actual,
    generateUploadUrl: jest.fn().mockResolvedValue('https://storage.googleapis.com/signed-put-url'),
    generateReadUrl: jest.fn().mockResolvedValue('https://storage.googleapis.com/signed-get-url'),
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const BcsAnalysis = require('../../src/models/BcsAnalysis');
const config = require('../../src/config/env');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('bcs-analysis upload + create + poll flow', () => {
  let app, token, user;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    user = await User.create({ email: 'uploader@example.com', name: 'Uploader', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  it('generates signed upload URLs and find-or-creates the cow', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis/upload-urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', files: [{ filename: 'a.jpg', contentType: 'image/jpeg' }, { filename: 'b.jpg', contentType: 'image/jpeg' }] });

    expect(res.status).toBe(200);
    expect(res.body.cowsId).toBe('3124');
    expect(res.body.uploads).toHaveLength(2);
    expect(res.body.uploads[0].uploadUrl).toBe('https://storage.googleapis.com/signed-put-url');
    expect(res.body.uploads[0].gsUri).toMatch(/^gs:\/\/.+\/3124\/.+\/a\.jpg$/);

    const cow = await Cow.findOne({ cowsId: '3124' });
    expect(cow).toBeTruthy();
  });

  it('reuses the same cow across two separate upload batches', async () => {
    await request(app)
      .post('/api/bcs-analysis/upload-urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', files: [{ filename: 'a.jpg', contentType: 'image/jpeg' }] });
    await request(app)
      .post('/api/bcs-analysis/upload-urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', files: [{ filename: 'c.jpg', contentType: 'image/jpeg' }] });

    const cows = await Cow.find({ cowsId: '3124' });
    expect(cows).toHaveLength(1);
  });

  it('creates a bcs_analysis record with status not_started and empty bcsScore', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`] });

    expect(res.status).toBe(201);
    expect(res.body.bcsAnalysis.status).toBe('not_started');
    expect(res.body.bcsAnalysis.bcsScore).toEqual({});
    expect(res.body.bcsAnalysis.createdBy).toBe(user._id.toString());
    expect(res.body.bcsAnalysis.is_approved).toBe(false);

    const stored = await BcsAnalysis.findById(res.body.bcsAnalysis.id);
    expect(stored).toBeTruthy();
    expect(stored.cow).toBeTruthy();
    expect(stored.is_approved).toBe(false);
  });

  it('rejects creation with a non gs:// image entry', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', cowsImages: ['https://example.com/a.jpg'] });
    expect(res.status).toBe(400);
  });

  it('rejects creation with an image path traversal attempt', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', cowsImages: [`gs://${config.gcs.bucketName}/../3124/ts/a.jpg`] });
    expect(res.status).toBe(400);
  });

  it('rejects creation with an image belonging to a different bucket', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', cowsImages: ['gs://some-other-bucket/3124/ts/a.jpg'] });
    expect(res.status).toBe(400);
  });

  it('rejects creation with an image belonging to a different cowsId', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', cowsImages: [`gs://${config.gcs.bucketName}/9999/ts/a.jpg`] });
    expect(res.status).toBe(400);
  });

  it('rejects upload-url requests with a path-traversal filename', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis/upload-urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', files: [{ filename: '../../etc/passwd', contentType: 'image/jpeg' }] });
    expect(res.status).toBe(400);
  });

  it('rejects upload-url requests with a path-traversal cowsId', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis/upload-urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '../3124', files: [{ filename: 'a.jpg', contentType: 'image/jpeg' }] });
    expect(res.status).toBe(400);
  });

  it('rejects upload-url requests with a disallowed content type', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis/upload-urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', files: [{ filename: 'a.svg', contentType: 'image/svg+xml' }] });
    expect(res.status).toBe(400);
  });

  it('polls a record by id', async () => {
    const createRes = await request(app)
      .post('/api/bcs-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`] });

    const res = await request(app)
      .get(`/api/bcs-analysis/${createRes.body.bcsAnalysis.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bcsAnalysis.status).toBe('not_started');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .get('/api/bcs-analysis/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  describe('PATCH /api/bcs-analysis/:id/approve', () => {
    it('sets is_approved to true on a completed analysis', async () => {
      const cow = await Cow.create({ cowsId: '3124' });
      const analysis = await BcsAnalysis.create({
        cow: cow._id,
        cowsId: '3124',
        cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`],
        status: 'completed',
        bcsScore: { mean_bcs_score: 3.25 },
        createdBy: user._id,
        updatedBy: user._id,
      });

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/approve`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.is_approved).toBe(true);

      const stored = await BcsAnalysis.findById(analysis._id);
      expect(stored.is_approved).toBe(true);
    });

    it('rejects approving an analysis that has not completed yet', async () => {
      const cow = await Cow.create({ cowsId: '3124' });
      const analysis = await BcsAnalysis.create({
        cow: cow._id,
        cowsId: '3124',
        cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`],
        status: 'processing',
        createdBy: user._id,
        updatedBy: user._id,
      });

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/approve`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);

      const stored = await BcsAnalysis.findById(analysis._id);
      expect(stored.is_approved).toBe(false);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app)
        .patch('/api/bcs-analysis/000000000000000000000000/approve')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/bcs-analysis/:id/override', () => {
    it('updates only mean_bcs_score on a completed analysis, keeping the per-provider breakdown', async () => {
      const cow = await Cow.create({ cowsId: '3124' });
      const analysis = await BcsAnalysis.create({
        cow: cow._id,
        cowsId: '3124',
        cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`],
        status: 'completed',
        bcsScore: {
          mean_bcs_score: 3.25,
          gemini: { final_bcs: 3.25, confidence: 'High', status: 'success' },
        },
        createdBy: user._id,
        updatedBy: user._id,
      });

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/override`)
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 3.5 });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.bcsScore.mean_bcs_score).toBe(3.5);
      expect(res.body.bcsAnalysis.bcsScore.gemini).toEqual({ final_bcs: 3.25, confidence: 'High', status: 'success' });

      const stored = await BcsAnalysis.findById(analysis._id);
      expect(stored.bcsScore.mean_bcs_score).toBe(3.5);
    });

    it('rounds an off-scale score to the nearest 0.25', async () => {
      const cow = await Cow.create({ cowsId: '3124' });
      const analysis = await BcsAnalysis.create({
        cow: cow._id,
        cowsId: '3124',
        cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`],
        status: 'completed',
        bcsScore: { mean_bcs_score: 3.25 },
        createdBy: user._id,
        updatedBy: user._id,
      });

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/override`)
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 3.4 });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.bcsScore.mean_bcs_score).toBe(3.5);
    });

    it('rejects a score outside 1-5', async () => {
      const cow = await Cow.create({ cowsId: '3124' });
      const analysis = await BcsAnalysis.create({
        cow: cow._id,
        cowsId: '3124',
        cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`],
        status: 'completed',
        bcsScore: { mean_bcs_score: 3.25 },
        createdBy: user._id,
        updatedBy: user._id,
      });

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/override`)
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 6 });

      expect(res.status).toBe(400);
    });

    it('rejects overriding an analysis that has not completed yet', async () => {
      const cow = await Cow.create({ cowsId: '3124' });
      const analysis = await BcsAnalysis.create({
        cow: cow._id,
        cowsId: '3124',
        cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`],
        status: 'processing',
        createdBy: user._id,
        updatedBy: user._id,
      });

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/override`)
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 3.5 });

      expect(res.status).toBe(409);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app)
        .patch('/api/bcs-analysis/000000000000000000000000/override')
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 3.5 });
      expect(res.status).toBe(404);
    });
  });
});
