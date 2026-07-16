const nodemailer = require('nodemailer');
const config = require('../config/env');

function createTransport() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

async function sendInviteEmail({ to, name, inviteUrl }) {
  const transport = createTransport();
  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject: 'You have been invited to BCS Tracker',
    html:
      `<p>Hi ${name || ''},</p>` +
      `<p>You've been invited to join BCS Tracker. Click below to set your password and activate your account:</p>` +
      `<p><a href="${inviteUrl}">${inviteUrl}</a></p>` +
      `<p>This link expires in 7 days.</p>`,
  });
}

module.exports = { sendInviteEmail, createTransport };
