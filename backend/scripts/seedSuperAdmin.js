/**
 * Creates (or re-links) a platform super_admin - the one role in this app
 * with no organization/facility scope at all, and deliberately no API
 * route that can create it. Prompts for the password interactively rather
 * than accepting it as a CLI arg, so it never lands in shell history or a
 * process listing. Safe to re-run: upserts the User by email and the
 * PlatformAdmin row, idempotent either way.
 *
 * Usage: node scripts/seedSuperAdmin.js <email> <name>
 */
const readline = require('readline');
const mongoose = require('mongoose');
const config = require('../src/config/env');
const User = require('../src/models/User');
const PlatformAdmin = require('../src/models/PlatformAdmin');
const { hashPassword } = require('../src/services/authService');

function promptHiddenPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function hide(stringToWrite) {
      if (stringToWrite.trim() === question.trim() || stringToWrite.includes('\n')) {
        originalWrite.call(rl, stringToWrite);
      }
      // otherwise: swallow the character echo, so the typed password never shows
    };
    rl.question(question, (answer) => {
      rl.history = rl.history.slice(1);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const [, , emailArg, ...nameParts] = process.argv;
  if (!emailArg) {
    console.error('Usage: node scripts/seedSuperAdmin.js <email> <name>');
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  const name = nameParts.length ? nameParts.join(' ') : email;

  const password = await promptHiddenPassword('Password for the super admin account: ');
  if (!password || password.length < 8) {
    console.error('A password of at least 8 characters is required.');
    process.exit(1);
  }

  await mongoose.connect(config.mongodbUrl);

  const passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { email, name, status: 'active', passwordHash } },
    { upsert: true, new: true }
  );

  await PlatformAdmin.findOneAndUpdate({ user: user._id }, { $set: { user: user._id } }, { upsert: true });

  console.log(`Super admin ready: ${email} (${user._id}).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
