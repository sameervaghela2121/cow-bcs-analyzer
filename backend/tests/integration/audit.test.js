const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const { createOrgAndFacility, createMember } = require('../helpers');
const Cow = require('../../src/models/Cow');
const AuditLog = require('../../src/models/AuditLog');

function makeEntry({ organization, facility, cow, user, action, scoreBefore, scoreAfter, approvedBefore, approvedAfter, updatedByBefore, updatedByAfter }) {
  return AuditLog.create({
    bcsAnalysis: new mongoose.Types.ObjectId(),
    cow: cow._id,
    organization: organization._id,
    facility: facility._id,
    cowsId: cow.cowsId,
    action,
    before: { finalBcs: scoreBefore, isApproved: approvedBefore, status: 'completed', updatedBy: (updatedByBefore || user)._id.toString() },
    after: { finalBcs: scoreAfter, isApproved: approvedAfter, status: 'completed', updatedBy: (updatedByAfter || user)._id.toString() },
    performedBy: user._id,
  });
}

describe('GET /api/audit', () => {
  let app, token, cow, user, organization, facility;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const created = await createOrgAndFacility();
    organization = created.organization;
    facility = created.facility;
    const member = await createMember({ email: 'audit@example.com', name: 'Audit Reviewer', organization, facility, role: created.roles.staff });
    token = member.token;
    user = member.user;
    cow = await Cow.create({ facility: facility._id, cowsId: '6006' });
    await makeEntry({ organization, facility, cow, user, action: 'provider_selected', scoreBefore: 3.0, scoreAfter: 3.0, approvedBefore: false, approvedAfter: true });
    await new Promise((r) => setTimeout(r, 10));
    await makeEntry({ organization, facility, cow, user, action: 'overridden', scoreBefore: 3.25, scoreAfter: 3.0, approvedBefore: false, approvedAfter: true });
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
    expect(overridden.before.finalBcs).toBe(3.25);
    expect(overridden.after.finalBcs).toBe(3.0);
    expect(overridden.before.isApproved).toBe(false);
    expect(overridden.after.isApproved).toBe(true);
  });

  it('filters by action', async () => {
    const res = await request(app).get('/api/audit?action=overridden').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('overridden');
  });

  it('filters by cowsId', async () => {
    const otherCow = await Cow.create({ facility: facility._id, cowsId: '7007' });
    await makeEntry({ organization, facility, cow: otherCow, user, action: 'provider_selected', scoreBefore: 3.0, scoreAfter: 3.0, approvedBefore: false, approvedAfter: true });

    const res = await request(app).get('/api/audit?cowsId=7007').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].cowsId).toBe('7007');
  });

  it('never returns entries belonging to a different facility', async () => {
    const other = await createOrgAndFacility();
    const otherCow = await Cow.create({ facility: other.facility._id, cowsId: '9009' });
    const otherMember = await createMember({ email: 'other@example.com', name: 'Other', organization: other.organization, facility: other.facility, role: other.roles.staff });
    await makeEntry({ organization: other.organization, facility: other.facility, cow: otherCow, user: otherMember.user, action: 'overridden', scoreBefore: 3.0, scoreAfter: 3.5, approvedBefore: false, approvedAfter: true });

    const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    expect(res.body.total).toBe(2);
    expect(res.body.entries.every((e) => e.cowsId !== '9009')).toBe(true);
  });
});

describe('GET /api/audit/:id', () => {
  let app, token, cow, user, entry, organization, facility, roles;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const created = await createOrgAndFacility();
    organization = created.organization;
    facility = created.facility;
    roles = created.roles;
    const member = await createMember({ email: 'audit2@example.com', name: 'Reviewer Two', organization, facility, role: roles.staff });
    token = member.token;
    user = member.user;
    cow = await Cow.create({ facility: facility._id, cowsId: '8008' });
    entry = await makeEntry({ organization, facility, cow, user, action: 'overridden', scoreBefore: 2.75, scoreAfter: 3.5, approvedBefore: false, approvedAfter: true });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('returns the full entry including before/after and performedBy', async () => {
    const res = await request(app).get(`/api/audit/${entry._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auditLog.id).toBe(entry._id.toString());
    expect(res.body.auditLog.cowsId).toBe('8008');
    expect(res.body.auditLog.action).toBe('overridden');
    expect(res.body.auditLog.before.finalBcs).toBe(2.75);
    expect(res.body.auditLog.after.finalBcs).toBe(3.5);
    expect(res.body.auditLog.performedBy.email).toBe('audit2@example.com');
  });

  it('resolves before/after updatedBy from raw user ids to names, even when they differ across the two snapshots', async () => {
    const uploader = await createMember({ email: 'uploader@example.com', name: 'Original Uploader', organization, facility, role: roles.staff });
    const entryWithDifferentUpdaters = await makeEntry({
      organization, facility, cow, user, action: 'overridden', scoreBefore: 3.0, scoreAfter: 3.5, approvedBefore: false, approvedAfter: true,
      updatedByBefore: uploader.user, updatedByAfter: user,
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
      organization: organization._id,
      facility: facility._id,
      cowsId: cow.cowsId,
      action: 'overridden',
      before: { finalBcs: 3.0, isApproved: false, status: 'completed', updatedBy: deletedUserId },
      after: { finalBcs: 3.5, isApproved: true, status: 'completed', updatedBy: deletedUserId },
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

  it('returns 404 for an entry belonging to a different facility', async () => {
    const other = await createOrgAndFacility();
    const otherCow = await Cow.create({ facility: other.facility._id, cowsId: '9009' });
    const otherMember = await createMember({ email: 'other2@example.com', name: 'Other', organization: other.organization, facility: other.facility, role: other.roles.staff });
    const otherEntry = await makeEntry({ organization: other.organization, facility: other.facility, cow: otherCow, user: otherMember.user, action: 'overridden', scoreBefore: 3.0, scoreAfter: 3.5, approvedBefore: false, approvedAfter: true });

    const res = await request(app).get(`/api/audit/${otherEntry._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
