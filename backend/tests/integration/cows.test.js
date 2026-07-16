const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const config = require('../../src/config/env');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('Cow CRUD', () => {
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'staff@example.com', name: 'Staff', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('creates a cow', async () => {
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({
      cowId: '4417', breed: 'Holstein', lactation: 'Mid', pen: 'Pen 1',
    });
    expect(res.status).toBe(201);
    expect(res.body.cow.cowId).toBe('4417');
  });

  it('rejects a duplicate cowId', async () => {
    await Cow.create({ cowId: '4417' });
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({ cowId: '4417' });
    expect(res.status).toBe(409);
  });

  it('gets a cow by cowId', async () => {
    await Cow.create({ cowId: '4417', breed: 'Jersey' });
    const res = await request(app).get('/api/cows/4417').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cow.breed).toBe('Jersey');
  });

  it('returns 404 for an unknown cowId', async () => {
    const res = await request(app).get('/api/cows/9999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('updates a cow', async () => {
    await Cow.create({ cowId: '4417', pen: 'Pen 1' });
    const res = await request(app).patch('/api/cows/4417').set('Authorization', `Bearer ${token}`).send({ pen: 'Pen 2' });
    expect(res.status).toBe(200);
    expect(res.body.cow.pen).toBe('Pen 2');
  });
});
