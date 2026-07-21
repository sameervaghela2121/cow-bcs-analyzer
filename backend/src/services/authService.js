const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// No expiresIn: access tokens never expire, so there's no refresh flow to
// keep them alive - login once and stay signed in. email/name ride along so
// the client can identify who's signed in without a round trip to /me.
function generateAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email, name: user.name },
    config.jwtAccessSecret
  );
}

function generateInviteToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateInviteToken,
  hashToken,
};
