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

const { generateAccessToken, generateInviteToken, hashToken } = require('../../src/services/authService');

describe('authService tokens', () => {
  const fakeUser = { _id: '507f1f77bcf86cd799439011', role: 'staff' };

  it('generates an access token carrying the user id and role, with no expiry', () => {
    const jwt = require('jsonwebtoken');
    const config = require('../../src/config/env');
    const token = generateAccessToken(fakeUser);
    const payload = jwt.verify(token, config.jwtAccessSecret);
    expect(payload.sub).toBe(fakeUser._id);
    expect(payload.role).toBe('staff');
    expect(payload.exp).toBeUndefined();
  });

  it('generates an invite token whose hash matches hashToken(raw)', () => {
    const { raw, hash } = generateInviteToken();
    expect(hashToken(raw)).toBe(hash);
    expect(raw).not.toBe(hash);
  });
});
