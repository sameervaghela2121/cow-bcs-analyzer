const User = require('../models/User');
const { generateInviteToken } = require('./authService');
const { sendInviteEmail } = require('./emailService');
const config = require('../config/env');

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function inviteUser({ email, name, role, invitedBy }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const err = new Error('A user with this email already exists.');
    err.status = 409;
    throw err;
  }
  const { raw, hash } = generateInviteToken();
  const user = await User.create({
    email: normalizedEmail,
    name,
    role,
    status: 'pending',
    inviteTokenHash: hash,
    inviteTokenExpiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
    invitedBy,
  });
  const inviteUrl = `${config.frontendUrl}/accept-invite?token=${raw}&email=${encodeURIComponent(normalizedEmail)}`;
  await sendInviteEmail({ to: normalizedEmail, name, inviteUrl });
  return user;
}

async function countAdmins(excludeUserId) {
  const query = { role: 'admin' };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  return User.countDocuments(query);
}

module.exports = { inviteUser, countAdmins, INVITE_TOKEN_TTL_MS };
