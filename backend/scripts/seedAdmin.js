/**
 * Bootstraps the first admin user in a fresh database. There is no
 * self-signup in this app - every other user must be invited by an existing
 * admin - so a brand-new database has no way to log in at all until one
 * admin is created directly. Sends the same "set your password" invite
 * email a normal admin-issued invite sends.
 *
 * Usage: node scripts/seedAdmin.js <email> <name>
 */
const mongoose = require('mongoose');
const config = require('../src/config/env');
const User = require('../src/models/User');
const Invitation = require('../src/models/Invitation');
const { generateInviteToken } = require('../src/services/authService');
const { sendInviteEmail } = require('../src/services/emailService');
const { INVITE_TOKEN_TTL_MS } = require('../src/services/userService');

async function main() {
  const [, , emailArg, ...nameParts] = process.argv;
  const email = (emailArg || 'devs@thirdrocktechkno.com').trim().toLowerCase();
  const name = nameParts.length ? nameParts.join(' ') : 'Dev';

  await mongoose.connect(config.mongodbUrl);

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`User already exists: ${existing._id} (${existing.email}, role=${existing.role}, status=${existing.status})`);
    await mongoose.disconnect();
    return;
  }

  const { raw, hash } = generateInviteToken();
  const user = await User.create({
    email,
    name,
    role: 'admin',
    status: 'pending',
    inviteTokenHash: hash,
    inviteTokenExpiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
    invitedBy: null,
  });

  const inviteUrl = `${config.frontendUrl}/accept-invite?token=${raw}&email=${encodeURIComponent(email)}`;

  try {
    await sendInviteEmail({ to: email, name, inviteUrl });
    // Self-referenced: this is a system bootstrap, not a real admin-to-admin invite.
    await Invitation.create({ user: user._id, invitedBy: user._id, email, status: 'sent' });
    console.log(`Created admin ${email} (${user._id}) and sent the invite email.`);
  } catch (err) {
    await Invitation.create({ user: user._id, invitedBy: user._id, email, status: 'failed', errorMessage: err.message });
    console.error(`Created admin ${email} (${user._id}) but the invite email failed: ${err.message}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
