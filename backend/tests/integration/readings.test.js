jest.mock('../../src/jobs/processReading', () => ({
  processReading: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const Reading = require('../../src/models/Reading');
const Media = require('../../src/models/Media');
const config = require('../../src/config/env');
const { processReading } = require('../../src/jobs/processReading');
const { saveFile } = require('../../src/services/storageService');

let app;

beforeAll(async () => { await connect(); app = createApp(); });
afterAll(async () => { await closeDatabase(); });

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('POST /api/readings', () => {
  let token;
  beforeEach(async () => {
    const user = await User.create({ email: 'up@example.com', name: 'Up', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

  it('creates a processing reading, auto-creating an unknown cow, and returns 202', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .field('cowId', '4417')
      .attach('files', Buffer.from('fake-image-bytes'), { filename: 'cow.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('processing');
    expect(res.body.readingId).toBeTruthy();

    const cow = await Cow.findOne({ cowId: '4417' });
    expect(cow).toBeTruthy();
    expect(cow.breed).toBe('Unknown');

    const reading = await Reading.findById(res.body.readingId);
    expect(reading.status).toBe('processing');
    expect(processReading).toHaveBeenCalledWith(res.body.readingId.toString());
  });

  it('batches multiple photos into a single reading with one media entry per photo', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .field('cowId', '4417')
      .attach('files', Buffer.from('front-bytes'), { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('files', Buffer.from('side-bytes'), { filename: 'side.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(202);
    const reading = await Reading.findById(res.body.readingId);
    expect(reading.media).toHaveLength(2);
    expect(processReading).toHaveBeenCalledTimes(1);
  });

  it('rejects a request with no cowId', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', Buffer.from('fake-image-bytes'), { filename: 'cow.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  it('rejects a request with no files', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .field('cowId', '4417');
    expect(res.status).toBe(400);
  });

  it('rejects a video file', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .field('cowId', '4417')
      .attach('files', Buffer.from('fake-video-bytes'), { filename: 'cow.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/readings/:id and /media', () => {
  let token, cow, media, reading;

  beforeEach(async () => {
    const user = await User.create({ email: 'poll@example.com', name: 'Poll', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowId: '5000' });
    const saved = await saveFile(Buffer.from('fake-bytes'), 'photo.jpg');
    media = await Media.create({ storageKey: saved.storageKey, mimeType: 'image/jpeg', size: saved.size });
    reading = await Reading.create({
      cow: cow._id, media: [media._id], status: 'scored', score: 3.25, band: 'ideal', confidence: 'high',
      reviewStatus: 'not_required', capturedAt: new Date(), createdBy: user._id,
    });
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

  it('returns the reading by id', async () => {
    const res = await request(app).get(`/api/readings/${reading._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.reading.score).toBe(3.25);
    expect(res.body.reading.cowId).toBe('5000');
  });

  it('returns 404 for an unknown reading id', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await request(app).get(`/api/readings/${fakeId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('streams the underlying media file', async () => {
    const res = await request(app).get(`/api/readings/${reading._id}/media`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('fake-bytes');
  });
});
