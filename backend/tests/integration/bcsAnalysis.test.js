jest.mock('../../src/services/gcsService', () => {
  const actual = jest.requireActual('../../src/services/gcsService');
  return {
    ...actual,
    generateUploadUrl: jest.fn().mockResolvedValue('https://storage.googleapis.com/signed-put-url'),
    generateReadUrl: jest.fn().mockResolvedValue('https://storage.googleapis.com/signed-get-url'),
  };
});

jest.mock('../../src/services/imageCompressorClient', () => ({
  triggerCompression: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { triggerCompression } = require('../../src/services/imageCompressorClient');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const BcsAnalysis = require('../../src/models/BcsAnalysis');
const AuditLog = require('../../src/models/AuditLog');
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
    // root-level, sibling of bcsScore - not nested inside it
    expect(res.body.bcsAnalysis.final_bcs).toBe(null);
    expect(res.body.bcsAnalysis.createdBy).toBe(user._id.toString());
    expect(res.body.bcsAnalysis.is_approved).toBe(false);

    const stored = await BcsAnalysis.findById(res.body.bcsAnalysis.id);
    expect(stored).toBeTruthy();
    expect(stored.cow).toBeTruthy();
    expect(stored.is_approved).toBe(false);
  });

  it('returns signed thumbnailUrls and displayUrls alongside imageUrls', async () => {
    const res = await request(app)
      .post('/api/bcs-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`] });

    expect(res.status).toBe(201);
    expect(res.body.bcsAnalysis.imageUrls).toEqual(['https://storage.googleapis.com/signed-get-url']);
    expect(res.body.bcsAnalysis.thumbnailUrls).toEqual(['https://storage.googleapis.com/signed-get-url']);
    expect(res.body.bcsAnalysis.displayUrls).toEqual(['https://storage.googleapis.com/signed-get-url']);
  });

  it('triggers image compression once per uploaded image after creating the record', async () => {
    const objectPath = '3124/2026-07-16T00-00-00-000Z/a.jpg';
    await request(app)
      .post('/api/bcs-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', cowsImages: [`gs://${config.gcs.bucketName}/${objectPath}`] });

    expect(triggerCompression).toHaveBeenCalledTimes(1);
    expect(triggerCompression).toHaveBeenCalledWith({ bucketName: config.gcs.bucketName, objectPath });
  });

  it('still creates the record and responds 201 even if compression fails', async () => {
    triggerCompression.mockRejectedValueOnce(new Error('sharp blew up'));

    const res = await request(app)
      .post('/api/bcs-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ cowsId: '3124', cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`] });

    expect(res.status).toBe(201);
    expect(res.body.bcsAnalysis.status).toBe('not_started');
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

  describe('PATCH /api/bcs-analysis/:id/select', () => {
    // claude=3.0, gemini=3.5, openai=3.0 -> mean=3.25, median=3.0 (the
    // middle of [3.0, 3.0, 3.5]). claude/openai/median all share the value
    // 3.0, deliberately, so selecting any one of them exercises the
    // auto-match-by-value behavior; gemini (3.5) and mean (3.25) are each
    // unique among the 5 candidates, for the single-match case.
    function makeCompletedAnalysis(overrides = {}) {
      return async () => {
        const cow = await Cow.create({ cowsId: '3124' });
        return BcsAnalysis.create({
          cow: cow._id,
          cowsId: '3124',
          cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`],
          status: 'completed',
          bcsScore: {
            claude: { final_bcs: 3.0, confidence: 'High', status: 'success', is_true: null },
            gemini: { final_bcs: 3.5, confidence: 'Medium', status: 'success', is_true: null },
            openai: { final_bcs: 3.0, confidence: 'High', status: 'success', is_true: null },
            is_mean_true: null,
            is_median_true: null,
            is_critical: false,
          },
          createdBy: user._id,
          updatedBy: user._id,
          ...overrides,
        });
      };
    }

    it('selecting a provider auto-matches every other candidate sharing its exact value', async () => {
      const analysis = await makeCompletedAnalysis()();

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'claude' });

      expect(res.status).toBe(200);
      // claude, openai, and median all equal 3.0 - one click on claude
      // marks all three true, nothing about them individually clicked.
      expect(res.body.bcsAnalysis.bcsScore.claude.is_true).toBe(true);
      expect(res.body.bcsAnalysis.bcsScore.openai.is_true).toBe(true);
      expect(res.body.bcsAnalysis.bcsScore.is_median_true).toBe(true);
      // gemini (3.5) and mean (3.25) don't match 3.0 - explicitly false, not null.
      expect(res.body.bcsAnalysis.bcsScore.gemini.is_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.is_mean_true).toBe(false);
      expect(res.body.bcsAnalysis.final_bcs).toBe(3.0);
      expect(res.body.bcsAnalysis.is_approved).toBe(true);

      const stored = await BcsAnalysis.findById(analysis._id);
      expect(stored.final_bcs).toBe(3.0);
      expect(stored.bcsScore.claude.is_true).toBe(true);
      expect(stored.bcsScore.openai.is_true).toBe(true);
    });

    it('selecting a candidate with no coincidental matches only marks that one true', async () => {
      const analysis = await makeCompletedAnalysis()();

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'gemini' });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.bcsScore.gemini.is_true).toBe(true);
      expect(res.body.bcsAnalysis.bcsScore.claude.is_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.openai.is_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.is_mean_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.is_median_true).toBe(false);
      expect(res.body.bcsAnalysis.final_bcs).toBe(3.5);
    });

    it('can select the computed mean directly, not just a provider or the median', async () => {
      const analysis = await makeCompletedAnalysis()();

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'mean' });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.bcsScore.is_mean_true).toBe(true);
      expect(res.body.bcsAnalysis.bcsScore.is_median_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.claude.is_true).toBe(false);
      // (3.0 + 3.5 + 3.0) / 3 = 3.1666... -> rounded to the nearest 0.25 = 3.25
      expect(res.body.bcsAnalysis.final_bcs).toBe(3.25);
    });

    it('switching the pick recomputes the whole match set from scratch, not additively', async () => {
      const analysis = await makeCompletedAnalysis()();
      await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'claude' }); // marks claude, openai, median true

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'gemini' }); // switching the pick entirely

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.bcsScore.gemini.is_true).toBe(true);
      // the previous pick's matches must not linger as stale true flags
      expect(res.body.bcsAnalysis.bcsScore.claude.is_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.openai.is_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.is_median_true).toBe(false);
      expect(res.body.bcsAnalysis.final_bcs).toBe(3.5);
    });

    it('rejects an unknown source', async () => {
      const analysis = await makeCompletedAnalysis()();
      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'not-a-real-source' });
      expect(res.status).toBe(400);
    });

    it('rejects selecting a provider that has no successful score', async () => {
      const analysis = await makeCompletedAnalysis({
        bcsScore: {
          claude: { final_bcs: 3.0, confidence: 'High', status: 'success', is_true: null },
          openai: { final_bcs: null, confidence: null, status: 'error', error_message: 'rate limit', is_true: null },
        },
      })();

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'openai' });

      expect(res.status).toBe(400);
      const stored = await BcsAnalysis.findById(analysis._id);
      expect(stored.is_approved).toBe(false);
    });

    it('rejects selecting on an analysis that has not completed yet', async () => {
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
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'gemini' });

      expect(res.status).toBe(409);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app)
        .patch('/api/bcs-analysis/000000000000000000000000/select')
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'gemini' });
      expect(res.status).toBe(404);
    });

    it('stamps updatedBy as the selecting user (not whoever created the record) and bumps updatedAt', async () => {
      const analysis = await makeCompletedAnalysis()();
      const originalUpdatedAt = analysis.updatedAt;

      const reviewer = await User.create({ email: 'reviewer@example.com', name: 'Reviewer', role: 'staff', status: 'active', passwordHash: 'x' });
      await new Promise((r) => setTimeout(r, 10));

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${tokenFor(reviewer)}`)
        .send({ source: 'gemini' });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.updatedBy).toBe(reviewer._id.toString());
      expect(new Date(res.body.bcsAnalysis.updatedAt).getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('records an audit log entry with the pre/post-selection snapshot', async () => {
      const analysis = await makeCompletedAnalysis()();

      await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'claude' });

      const entries = await AuditLog.find({ bcsAnalysis: analysis._id });
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('provider_selected');
      expect(entries[0].performedBy.toString()).toBe(user._id.toString());
      expect(entries[0].before.final_bcs).toBe(null);
      expect(entries[0].after.final_bcs).toBe(3.0);
      expect(entries[0].before.is_approved).toBe(false);
      expect(entries[0].after.is_approved).toBe(true);
      expect(entries[0].before.bcsScore.claude.is_true).toBe(null);
      expect(entries[0].after.bcsScore.claude.is_true).toBe(true);
    });

    it('still selects successfully even if the audit log write fails', async () => {
      const analysis = await makeCompletedAnalysis()();
      const createSpy = jest.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('mongo blew up'));

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/select`)
        .set('Authorization', `Bearer ${token}`)
        .send({ source: 'gemini' });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.final_bcs).toBe(3.5);

      createSpy.mockRestore();
    });
  });

  describe('PATCH /api/bcs-analysis/:id/override', () => {
    function makeCompletedAnalysis(overrides = {}) {
      return async () => {
        const cow = await Cow.create({ cowsId: '3124' });
        return BcsAnalysis.create({
          cow: cow._id,
          cowsId: '3124',
          cowsImages: [`gs://${config.gcs.bucketName}/3124/2026-07-16T00-00-00-000Z/a.jpg`],
          status: 'completed',
          bcsScore: {
            claude: { final_bcs: 3.0, confidence: 'High', status: 'success', is_true: null },
            gemini: { final_bcs: 3.5, confidence: 'Medium', status: 'success', is_true: null },
            is_mean_true: null,
            is_median_true: null,
            is_critical: false,
          },
          createdBy: user._id,
          updatedBy: user._id,
          ...overrides,
        });
      };
    }

    it('sets final_bcs to the typed value and clears every candidate flag to false', async () => {
      const analysis = await makeCompletedAnalysis()();

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/override`)
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 4.0 });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.final_bcs).toBe(4.0);
      // a manual override isn't matched against anything - not even a
      // coincidentally-equal candidate gets marked true.
      expect(res.body.bcsAnalysis.bcsScore.claude.is_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.gemini.is_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.is_mean_true).toBe(false);
      expect(res.body.bcsAnalysis.bcsScore.is_median_true).toBe(false);
      expect(res.body.bcsAnalysis.is_approved).toBe(true);

      const stored = await BcsAnalysis.findById(analysis._id);
      expect(stored.final_bcs).toBe(4.0);
      expect(stored.is_approved).toBe(true);
    });

    it('rounds an off-scale score to the nearest 0.25', async () => {
      const analysis = await makeCompletedAnalysis()();

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/override`)
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 3.4 });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.final_bcs).toBe(3.5);
    });

    it('rejects a score outside 1-5', async () => {
      const analysis = await makeCompletedAnalysis()();

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

    it('stamps updatedBy as the overriding user (not whoever created the record) and bumps updatedAt', async () => {
      const analysis = await makeCompletedAnalysis()();
      const originalUpdatedAt = analysis.updatedAt;

      const reviewer = await User.create({ email: 'reviewer2@example.com', name: 'Reviewer', role: 'staff', status: 'active', passwordHash: 'x' });
      await new Promise((r) => setTimeout(r, 10));

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/override`)
        .set('Authorization', `Bearer ${tokenFor(reviewer)}`)
        .send({ score: 3.5 });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.updatedBy).toBe(reviewer._id.toString());
      expect(new Date(res.body.bcsAnalysis.updatedAt).getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('records an audit log entry capturing the override value and every flag clearing to false', async () => {
      const analysis = await makeCompletedAnalysis()();

      await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/override`)
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 4.5 });

      const entries = await AuditLog.find({ bcsAnalysis: analysis._id });
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('overridden');
      expect(entries[0].before.final_bcs).toBe(null);
      expect(entries[0].after.final_bcs).toBe(4.5);
      expect(entries[0].after.bcsScore.claude.is_true).toBe(false);
      expect(entries[0].after.bcsScore.is_median_true).toBe(false);
    });

    it('still overrides successfully even if the audit log write fails', async () => {
      const analysis = await makeCompletedAnalysis()();
      const createSpy = jest.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('mongo blew up'));

      const res = await request(app)
        .patch(`/api/bcs-analysis/${analysis._id}/override`)
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 3.5 });

      expect(res.status).toBe(200);
      expect(res.body.bcsAnalysis.final_bcs).toBe(3.5);

      createSpy.mockRestore();
    });
  });
});
