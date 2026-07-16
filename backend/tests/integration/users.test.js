jest.mock('../../src/services/emailService', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const config = require('../../src/config/env');
const { sendInviteEmail } = require('../../src/services/emailService');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('POST /api/users/invite', () => {
  let app, admin, adminToken;

  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    admin = await User.create({ email: 'admin@example.com', name: 'Admin', role: 'admin', status: 'active', passwordHash: 'x' });
    adminToken = tokenFor(admin);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  it('rejects non-admins', async () => {
    const staff = await User.create({ email: 'staff@example.com', name: 'Staff', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${tokenFor(staff)}`)
      .send({ email: 'new@example.com', name: 'New Person', role: 'staff' });
    expect(res.status).toBe(403);
  });

  it('creates a pending user and sends an invite email', async () => {
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new@example.com', name: 'New Person', role: 'staff' });

    expect(res.status).toBe(201);
    expect(res.body.user.status).toBe('pending');
    expect(res.body.user.email).toBe('new@example.com');
    expect(sendInviteEmail).toHaveBeenCalledTimes(1);

    const stored = await User.findOne({ email: 'new@example.com' });
    expect(stored.inviteTokenHash).toBeTruthy();
    expect(stored.passwordHash).toBeNull();
  });

  it('rejects inviting an email that already exists', async () => {
    await User.create({ email: 'dup@example.com', name: 'Dup', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'dup@example.com', name: 'Dup Two', role: 'staff' });
    expect(res.status).toBe(409);
  });
});
