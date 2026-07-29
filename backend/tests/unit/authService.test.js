const { hashPassword, comparePassword } = require('../../src/services/authService');

describe('authService password hashing', () => {
  it('hashes a password and verifies it against the hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    await expect(comparePassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(comparePassword('wrong-password', hash)).resolves.toBe(false);
  });
});

const { generateAccessToken, generateSessionToken, generateInviteToken, hashToken } = require('../../src/services/authService');

describe('authService tokens', () => {
  const fakeUser = { _id: '507f1f77bcf86cd799439011', email: 'staff@example.com', name: 'Staff Person' };

  it('generates a login-only access token carrying just the user id, with no expiry', () => {
    const jwt = require('jsonwebtoken');
    const config = require('../../src/config/env');
    const token = generateAccessToken(fakeUser);
    const payload = jwt.verify(token, config.jwtAccessSecret);
    expect(payload.sub).toBe(fakeUser._id);
    expect(payload.membershipId).toBeUndefined();
    expect(payload.exp).toBeUndefined();
  });

  it('generates a session token carrying membership/organization/facility/role/permissions', () => {
    const jwt = require('jsonwebtoken');
    const config = require('../../src/config/env');
    const membership = {
      _id: '507f1f77bcf86cd799439012',
      organization: '507f1f77bcf86cd799439013',
      facility: '507f1f77bcf86cd799439014',
    };
    const role = { _id: '507f1f77bcf86cd799439015', name: 'Staff', permissions: ['cow.view'] };
    const token = generateSessionToken({ user: fakeUser, membership, role });
    const payload = jwt.verify(token, config.jwtAccessSecret);
    expect(payload.sub).toBe(fakeUser._id);
    expect(payload.membershipId).toBe(membership._id);
    expect(payload.organizationId).toBe(membership.organization);
    expect(payload.facilityId).toBe(membership.facility);
    expect(payload.roleId).toBe(role._id);
    expect(payload.roleName).toBe('Staff');
    expect(payload.permissions).toEqual(['cow.view']);
    expect(payload.exp).toBeUndefined();
  });

  it('a session token for an org-wide membership (no facility) carries facilityId: null', () => {
    const jwt = require('jsonwebtoken');
    const config = require('../../src/config/env');
    const membership = { _id: '507f1f77bcf86cd799439012', organization: '507f1f77bcf86cd799439013', facility: null };
    const role = { _id: '507f1f77bcf86cd799439015', name: 'Org-Admin', permissions: [] };
    const token = generateSessionToken({ user: fakeUser, membership, role });
    const payload = jwt.verify(token, config.jwtAccessSecret);
    expect(payload.facilityId).toBeNull();
  });

  it('generates an invite token whose hash matches hashToken(raw)', () => {
    const { raw, hash } = generateInviteToken();
    expect(hashToken(raw)).toBe(hash);
    expect(raw).not.toBe(hash);
  });
});
