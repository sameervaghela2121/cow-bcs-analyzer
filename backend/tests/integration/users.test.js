jest.mock('../../src/services/emailService', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Invitation = require('../../src/models/Invitation');
const config = require('../../src/config/env');
const { sendInviteEmail } = require('../../src/services/emailService');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

// connect()/closeDatabase() are hoisted to file scope rather than scoped to
// the first describe (as auth.test.js originally had it, and this file
// accumulates a new describe per task the same way — see Task 7's fix in
// auth.test.js for the "closes shared connection too early" failure mode
// this avoids).
beforeAll(async () => { await connect(); });
afterAll(async () => { await closeDatabase(); });

describe('POST /api/users/invite', () => {
  let app, admin, adminToken;

  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    admin = await User.create({ email: 'admin@example.com', name: 'Admin', role: 'admin', status: 'active', passwordHash: 'x' });
    adminToken = tokenFor(admin);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

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

    const invitation = await Invitation.findOne({ email: 'new@example.com' });
    expect(invitation).toBeTruthy();
    expect(invitation.status).toBe('sent');
    expect(invitation.user.toString()).toBe(stored._id.toString());
    expect(invitation.invitedBy.toString()).toBe(admin._id.toString());
  });

  it('rejects inviting an email that already exists', async () => {
    await User.create({ email: 'dup@example.com', name: 'Dup', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'dup@example.com', name: 'Dup Two', role: 'staff' });
    expect(res.status).toBe(409);
  });

  it('logs a failed invitation when the invite email fails to send', async () => {
    sendInviteEmail.mockRejectedValueOnce(new Error('SMTP is down'));
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'unreachable@example.com', name: 'Unreachable', role: 'staff' });

    expect(res.status).toBe(500);
    const invitation = await Invitation.findOne({ email: 'unreachable@example.com' });
    expect(invitation).toBeTruthy();
    expect(invitation.status).toBe('failed');
    expect(invitation.errorMessage).toBe('SMTP is down');
  });
});

describe('GET/PATCH/DELETE /api/users', () => {
  let app, admin, adminToken;
  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    admin = await User.create({ email: 'admin2@example.com', name: 'Admin2', role: 'admin', status: 'active', passwordHash: 'x' });
    adminToken = tokenFor(admin);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

  it('lists users', async () => {
    await User.create({ email: 'a@example.com', name: 'A', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBe(2);
  });

  it('changes a user role', async () => {
    const staff = await User.create({ email: 'b@example.com', name: 'B', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app)
      .patch(`/api/users/${staff._id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('refuses to demote the last remaining admin', async () => {
    const res = await request(app)
      .patch(`/api/users/${admin._id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'staff' });
    expect(res.status).toBe(400);
  });

  it('removes a user', async () => {
    const staff = await User.create({ email: 'c@example.com', name: 'C', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app).delete(`/api/users/${staff._id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(await User.findById(staff._id)).toBeNull();
  });

  it('refuses to remove the last remaining admin', async () => {
    const res = await request(app).delete(`/api/users/${admin._id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
