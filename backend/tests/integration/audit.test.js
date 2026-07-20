const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const AuditLog = require('../../src/models/AuditLog');
const config = require('../../src/config/env');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

function makeEntry({ cow, user, action, scoreBefore, scoreAfter, approvedBefore, approvedAfter, updatedByBefore, updatedByAfter }) {
  return AuditLog.create({
    bcsAnalysis: new mongoose.Types.ObjectId(),
    cow: cow._id,
    cowsId: cow.cowsId,
    action,
    before: { final_bcs: scoreBefore, is_approved: approvedBefore, status: 'completed', updatedBy: (updatedByBefore || user)._id.toString() },
    after: { final_bcs: scoreAfter, is_approved: approvedAfter, status: 'completed', updatedBy: (updatedByAfter || user)._id.toString() },
    performedBy: user._id,
  });
}

describe('GET /api/audit', () => {
  let app, token, cow, user;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    user = await User.create({ email: 'audit@example.com', name: 'Audit Reviewer', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowsId: '6006' });
    await makeEntry({ cow, user, action: 'provider_selected', scoreBefore: 3.0, scoreAfter: 3.0, approvedBefore: false, approvedAfter: true });
    await new Promise((r) => setTimeout(r, 10));
    await makeEntry({ cow, user, action: 'overridden', scoreBefore: 3.25, scoreAfter: 3.0, approvedBefore: false, approvedAfter: true });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('lists audit entries reverse-chronologically, with performedBy resolved to name/email', async () => {
    const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.entries[0].action).toBe('overridden');
    expect(res.body.entries[1].action).toBe('provider_selected');
    expect(res.body.entries[0].cowsId).toBe('6006');
    expect(res.body.entries[0].performedBy).toEqual({ id: user._id.toString(), name: 'Audit Reviewer', email: 'audit@example.com' });
  });

  it('resolves updatedBy to a name in the list endpoint too, not just the raw id', async () => {
    const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    for (const entry of res.body.entries) {
      expect(entry.before.updatedBy).toBe('Audit Reviewer');
      expect(entry.after.updatedBy).toBe('Audit Reviewer');
    }
  });

  it('includes the full before/after snapshots on each entry', async () => {
    const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    const overridden = res.body.entries.find((e) => e.action === 'overridden');
    expect(overridden.before.final_bcs).toBe(3.25);
    expect(overridden.after.final_bcs).toBe(3.0);
    expect(overridden.before.is_approved).toBe(false);
    expect(overridden.after.is_approved).toBe(true);
  });

  it('filters by action', async () => {
    const res = await request(app).get('/api/audit?action=overridden').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('overridden');
  });

  it('filters by cowsId', async () => {
    const otherCow = await Cow.create({ cowsId: '7007' });
    await makeEntry({ cow: otherCow, user, action: 'provider_selected', scoreBefore: 3.0, scoreAfter: 3.0, approvedBefore: false, approvedAfter: true });

    const res = await request(app).get('/api/audit?cowsId=7007').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].cowsId).toBe('7007');
  });
});

describe('GET /api/audit/:id', () => {
  let app, token, cow, user, entry;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    user = await User.create({ email: 'audit2@example.com', name: 'Reviewer Two', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowsId: '8008' });
    entry = await makeEntry({ cow, user, action: 'overridden', scoreBefore: 2.75, scoreAfter: 3.5, approvedBefore: false, approvedAfter: true });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('returns the full entry including before/after and performedBy', async () => {
    const res = await request(app).get(`/api/audit/${entry._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auditLog.id).toBe(entry._id.toString());
    expect(res.body.auditLog.cowsId).toBe('8008');
    expect(res.body.auditLog.action).toBe('overridden');
    expect(res.body.auditLog.before.final_bcs).toBe(2.75);
    expect(res.body.auditLog.after.final_bcs).toBe(3.5);
    expect(res.body.auditLog.performedBy.email).toBe('audit2@example.com');
  });

  it('resolves before/after updatedBy from raw user ids to names, even when they differ across the two snapshots', async () => {
    const uploader = await User.create({ email: 'uploader@example.com', name: 'Original Uploader', role: 'staff', status: 'active', passwordHash: 'x' });
    const entryWithDifferentUpdaters = await makeEntry({
      cow, user, action: 'overridden', scoreBefore: 3.0, scoreAfter: 3.5, approvedBefore: false, approvedAfter: true,
      updatedByBefore: uploader, updatedByAfter: user,
    });

    const res = await request(app).get(`/api/audit/${entryWithDifferentUpdaters._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auditLog.before.updatedBy).toBe('Original Uploader');
    expect(res.body.auditLog.after.updatedBy).toBe('Reviewer Two');
  });

  it('falls back to the raw id when the referenced user no longer exists', async () => {
    const deletedUserId = new mongoose.Types.ObjectId().toString();
    const entryWithDeletedUser = await AuditLog.create({
      bcsAnalysis: new mongoose.Types.ObjectId(),
      cow: cow._id,
      cowsId: cow.cowsId,
      action: 'overridden',
      before: { final_bcs: 3.0, is_approved: false, status: 'completed', updatedBy: deletedUserId },
      after: { final_bcs: 3.5, is_approved: true, status: 'completed', updatedBy: deletedUserId },
      performedBy: user._id,
    });

    const res = await request(app).get(`/api/audit/${entryWithDeletedUser._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auditLog.before.updatedBy).toBe(deletedUserId);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get(`/api/audit/${new mongoose.Types.ObjectId()}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed id', async () => {
    const res = await request(app).get('/api/audit/not-a-valid-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
