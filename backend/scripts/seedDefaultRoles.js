/**
 * Seeds the 3 platform-default roles (organization: null) every
 * organization uses out of the box - Org-Admin, Facility-Admin, Staff.
 * Idempotent: safe to re-run, only creates whichever of the three don't
 * already exist.
 *
 * Usage: node scripts/seedDefaultRoles.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/env');
const Role = require('../src/models/Role');

const DEFAULT_ROLES = ['Org-Admin', 'Facility-Admin', 'Staff'];

async function main() {
  await mongoose.connect(config.mongodbUrl);
  for (const name of DEFAULT_ROLES) {
    const existing = await Role.findOne({ organization: null, name });
    if (existing) {
      console.log(`'${name}' already exists (${existing._id}).`);
      continue;
    }
    const role = await Role.create({ organization: null, name, permissions: [] });
    console.log(`Created '${name}' (${role._id}).`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
