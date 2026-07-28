/**
 * Renames the 2 platform-default roles that used to have a space in their
 * name to their hyphenated form - "Org Admin" -> "Org-Admin",
 * "Facility Admin" -> "Facility-Admin". "Staff" is unaffected (no space).
 * Idempotent: safe to re-run, only renames whichever still has the old name.
 * Only touches the Role document's `name` field - every Membership/
 * Invitation just holds a `role` ObjectId ref, so nothing else needs to change.
 *
 * Usage: node scripts/renameDefaultRoles.js [--execute]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/env');
const Role = require('../src/models/Role');

const RENAMES = [
  { from: 'Org Admin', to: 'Org-Admin' },
  { from: 'Facility Admin', to: 'Facility-Admin' },
];

async function main() {
  const execute = process.argv.includes('--execute');
  await mongoose.connect(config.mongodbUrl);

  for (const { from, to } of RENAMES) {
    const matches = await Role.find({ name: from });
    if (matches.length === 0) {
      console.log(`No roles named '${from}' found.`);
      continue;
    }
    for (const role of matches) {
      console.log(`${execute ? 'Renaming' : '[dry-run] Would rename'} role ${role._id} (org: ${role.organization || 'platform-default'}): '${from}' -> '${to}'`);
      if (execute) {
        role.name = to;
        await role.save();
      }
    }
  }

  if (!execute) console.log('\nDry run only - re-run with --execute to apply.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
