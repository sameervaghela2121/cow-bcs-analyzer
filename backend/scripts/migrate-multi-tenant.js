/**
 * One-off migration: creates the "Good Farm" organization and its "Modasa"
 * facility, seeds the 3 platform-default roles, and moves every existing
 * record (cows, bcs_analysis, audit_logs, milking_records, users) into
 * that single tenant. Users' old role: 'admin'/'staff' field (no longer
 * part of the User schema, so read via the raw driver below) becomes a
 * Membership: 'admin' -> org-wide 'Org-Admin', 'staff' -> facility-scoped
 * 'Staff'.
 *
 * Usage:
 *   node scripts/migrate-multi-tenant.js            # dry run - reports counts only, writes nothing
 *   node scripts/migrate-multi-tenant.js --execute  # performs the writes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/env');
const Organization = require('../src/models/Organization');
const Facility = require('../src/models/Facility');
const Role = require('../src/models/Role');
const Membership = require('../src/models/Membership');
const Cow = require('../src/models/Cow');
const BcsAnalysis = require('../src/models/BcsAnalysis');
const AuditLog = require('../src/models/AuditLog');
const MilkingRecord = require('../src/models/MilkingRecord');

const EXECUTE = process.argv.includes('--execute');

const ORG_NAME = 'Good Farm';
const ORG_SLUG = 'good-farm';
const FACILITY_NAME = 'Modasa';
const FACILITY_SLUG = 'modasa';
const DEFAULT_ROLES = ['Org-Admin', 'Facility-Admin', 'Staff'];

async function main() {
  await mongoose.connect(config.mongodbUrl);
  const db = mongoose.connection.db;

  const cowsMissing = await Cow.countDocuments({ facility: { $exists: false } });
  const bcsMissing = await BcsAnalysis.countDocuments({ facility: { $exists: false } });
  const auditMissing = await AuditLog.countDocuments({ facility: { $exists: false } });
  const milkingMissing = await MilkingRecord.countDocuments({ facility: { $exists: false } });
  const users = await db.collection('users').find({}).toArray();
  const invitationsMissing = await db.collection('invitations').countDocuments({ organization: { $exists: false } });
  const existingOrg = await Organization.findOne({ slug: ORG_SLUG });
  const existingMemberships = await Membership.countDocuments();

  console.log(`cows: ${cowsMissing} missing facility`);
  console.log(`bcs_analysis: ${bcsMissing} missing organization/facility`);
  console.log(`audit_logs: ${auditMissing} missing organization/facility`);
  console.log(`milking_records: ${milkingMissing} missing organization/facility`);
  console.log(`users: ${users.length} total, ${users.filter((u) => u.role).length} still carry an old role field`);
  console.log(`invitations: ${invitationsMissing} missing organization/facility`);
  console.log(`'${ORG_NAME}' organization already exists: ${!!existingOrg}`);
  console.log(`memberships already created: ${existingMemberships}`);

  if (!EXECUTE) {
    console.log('\nDry run only - no writes performed. Re-run with --execute to apply.');
    await mongoose.connection.close();
    return;
  }

  let org = existingOrg;
  if (!org) {
    org = await Organization.create({ name: ORG_NAME, slug: ORG_SLUG });
    console.log(`Created organization '${ORG_NAME}' (${org._id}).`);
  }

  let facility = await Facility.findOne({ organization: org._id, slug: FACILITY_SLUG });
  if (!facility) {
    facility = await Facility.create({ organization: org._id, name: FACILITY_NAME, slug: FACILITY_SLUG });
    console.log(`Created facility '${FACILITY_NAME}' (${facility._id}).`);
  }

  const roleIdByName = {};
  for (const name of DEFAULT_ROLES) {
    let role = await Role.findOne({ organization: null, name });
    if (!role) {
      role = await Role.create({ organization: null, name, permissions: [] });
      console.log(`Seeded default role '${name}' (${role._id}).`);
    }
    roleIdByName[name] = role._id;
  }

  const cowsResult = await Cow.updateMany({ facility: { $exists: false } }, { $set: { facility: facility._id } });
  console.log(`cows: matched ${cowsResult.matchedCount}, modified ${cowsResult.modifiedCount}`);

  const bcsResult = await BcsAnalysis.updateMany(
    { facility: { $exists: false } },
    { $set: { organization: org._id, facility: facility._id } }
  );
  console.log(`bcs_analysis: matched ${bcsResult.matchedCount}, modified ${bcsResult.modifiedCount}`);

  const auditResult = await AuditLog.updateMany(
    { facility: { $exists: false } },
    { $set: { organization: org._id, facility: facility._id } }
  );
  console.log(`audit_logs: matched ${auditResult.matchedCount}, modified ${auditResult.modifiedCount}`);

  const milkingResult = await MilkingRecord.updateMany(
    { facility: { $exists: false } },
    { $set: { organization: org._id, facility: facility._id } }
  );
  console.log(`milking_records: matched ${milkingResult.matchedCount}, modified ${milkingResult.modifiedCount}`);

  for (const user of users) {
    const oldRole = user.role; // stripped from the Mongoose schema - only readable via the raw driver
    const roleName = oldRole === 'admin' ? 'Org-Admin' : 'Staff';
    const membershipFacility = roleName === 'Org-Admin' ? null : facility._id;

    const existingMembership = await Membership.findOne({
      user: user._id,
      organization: org._id,
      facility: membershipFacility,
    });
    if (!existingMembership) {
      await Membership.create({
        user: user._id,
        organization: org._id,
        facility: membershipFacility,
        role: roleIdByName[roleName],
      });
      console.log(`Created '${roleName}' membership for ${user.email}.`);
    }

    await db
      .collection('users')
      .updateOne({ _id: user._id }, { $unset: { role: '', inviteTokenHash: '', inviteTokenExpiresAt: '', invitedBy: '' } });
  }

  const invitationsResult = await db
    .collection('invitations')
    .updateMany({ organization: { $exists: false } }, { $set: { organization: org._id, facility: facility._id } });
  console.log(`invitations: matched ${invitationsResult.matchedCount}, modified ${invitationsResult.modifiedCount}`);

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
