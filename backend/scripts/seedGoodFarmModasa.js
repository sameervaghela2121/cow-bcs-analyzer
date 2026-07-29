/**
 * Seeds the "Good Farm" organization with "Modasa" facility and "Dev Shah"
 * as the Facility-Admin. Creates the organization, facility, user, and membership.
 * Password is set via command line or left as pending for the user to set later.
 *
 * Usage:
 *   node scripts/seedGoodFarmModasa.js                              # Creates user, password prompt
 *   node scripts/seedGoodFarmModasa.js --password <password>        # Creates user with password
 *   node scripts/seedGoodFarmModasa.js --password <password> --dry-run  # Dry run only
 */
const readline = require('readline');
const mongoose = require('mongoose');
const config = require('../src/config/env');
const Organization = require('../src/models/Organization');
const Facility = require('../src/models/Facility');
const Role = require('../src/models/Role');
const User = require('../src/models/User');
const Membership = require('../src/models/Membership');
const { hashPassword } = require('../src/services/authService');

function promptHiddenPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function hide(stringToWrite) {
      if (stringToWrite.trim() === question.trim() || stringToWrite.includes('\n')) {
        originalWrite.call(rl, stringToWrite);
      }
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
  const dryRun = process.argv.includes('--dry-run');
  const passwordIndex = process.argv.indexOf('--password');
  let password = passwordIndex > -1 ? process.argv[passwordIndex + 1] : null;

  if (!password) {
    password = await promptHiddenPassword('Password for Dev Shah (Facility-Admin): ');
  }

  if (!password || password.length < 8) {
    console.error('A password of at least 8 characters is required.');
    process.exit(1);
  }

  await mongoose.connect(config.mongodbUrl);

  try {
    console.log(`${dryRun ? '[DRY RUN] Would create' : 'Creating'} Good Farm organization...`);
    const organization = await Organization.findOneAndUpdate(
      { slug: 'good-farm' },
      {
        $set: {
          slug: 'good-farm',
          name: 'Good Farm',
          status: 'active',
        },
      },
      { upsert: true, new: true }
    );
    console.log(`  Organization: ${organization.name} (${organization._id})`);

    console.log(`${dryRun ? '[DRY RUN] Would create' : 'Creating'} Modasa facility...`);
    const facility = await Facility.findOneAndUpdate(
      { organization: organization._id, slug: 'modasa' },
      {
        $set: {
          organization: organization._id,
          slug: 'modasa',
          name: 'Modasa',
          status: 'active',
        },
      },
      { upsert: true, new: true }
    );
    console.log(`  Facility: ${facility.name} (${facility._id})`);

    console.log(`${dryRun ? '[DRY RUN] Would fetch' : 'Fetching'} Facility-Admin role...`);
    const facilityAdminRole = await Role.findOne({ name: 'Facility-Admin', organization: null });
    if (!facilityAdminRole) {
      throw new Error('Facility-Admin role not found. Run seedDefaultRoles.js first.');
    }
    console.log(`  Role: ${facilityAdminRole.name} (${facilityAdminRole._id})`);

    console.log(`${dryRun ? '[DRY RUN] Would create' : 'Creating'} Dev Shah user...`);
    const passwordHash = await hashPassword(password);
    const user = await User.findOneAndUpdate(
      { email: 'devs@thirdrocktechkno.com' },
      {
        $set: {
          email: 'devs@thirdrocktechkno.com',
          name: 'Dev Shah',
          status: 'active',
          passwordHash,
        },
      },
      { upsert: true, new: true }
    );
    console.log(`  User: ${user.name} (${user._id})`);

    console.log(`${dryRun ? '[DRY RUN] Would create' : 'Creating'} Facility-Admin membership...`);
    const membership = await Membership.findOneAndUpdate(
      { user: user._id, organization: organization._id, facility: facility._id },
      {
        $set: {
          user: user._id,
          organization: organization._id,
          facility: facility._id,
          role: facilityAdminRole._id,
          status: 'active',
          joinedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    console.log(`  Membership: ${membership._id}`);

    if (!dryRun) {
      console.log('\n✓ Setup complete!');
      console.log(`  Login as: devs@thirdrocktechkno.com`);
      console.log(`  Role: Facility-Admin (Modasa facility in Good Farm org)`);
    } else {
      console.log('\n[DRY RUN] No changes made.');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
