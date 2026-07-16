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
const config = require('../../src/config/env');
const { processReading } = require('../../src/jobs/processReading');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('POST /api/readings', () => {
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'up@example.com', name: 'Up', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  it('creates a processing reading, auto-creating an unknown cow, and returns 202', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .field('cowId', '4417')
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'cow.jpg', contentType: 'image/jpeg' });

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

  it('rejects a request with no cowId', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'cow.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  it('rejects a video file', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .field('cowId', '4417')
      .attach('file', Buffer.from('fake-video-bytes'), { filename: 'cow.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(400);
  });
});
