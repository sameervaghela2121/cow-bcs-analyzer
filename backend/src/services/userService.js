const User = require('../models/User');
const Invitation = require('../models/Invitation');
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

  try {
    await sendInviteEmail({ to: normalizedEmail, name, inviteUrl });
    await Invitation.create({ user: user._id, invitedBy, email: normalizedEmail, status: 'sent' });
  } catch (err) {
    await Invitation.create({
      user: user._id,
      invitedBy,
      email: normalizedEmail,
      status: 'failed',
      errorMessage: err.message,
    });
    throw err;
  }

  return user;
}

async function countAdmins(excludeUserId) {
  const query = { role: 'admin' };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  return User.countDocuments(query);
}

async function listUsers({ status, role } = {}) {
  const query = {};
  if (status) query.status = status;
  if (role) query.role = role;
  return User.find(query).sort({ createdAt: 1 });
}

async function changeRole(userId, newRole) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }
  if (user.role === 'admin' && newRole !== 'admin') {
    const remaining = await countAdmins(userId);
    if (remaining === 0) {
      const err = new Error('Cannot demote the last remaining admin.');
      err.status = 400;
      throw err;
    }
  }
  user.role = newRole;
  await user.save();
  return user;
}

async function removeUser(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }
  if (user.role === 'admin') {
    const remaining = await countAdmins(userId);
    if (remaining === 0) {
      const err = new Error('Cannot remove the last remaining admin.');
      err.status = 400;
      throw err;
    }
  }
  await User.deleteOne({ _id: userId });
}

module.exports = { inviteUser, countAdmins, listUsers, changeRole, removeUser, INVITE_TOKEN_TTL_MS };
