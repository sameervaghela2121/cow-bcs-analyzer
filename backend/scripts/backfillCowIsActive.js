/**
 * One-time backfill for the `isActive` field added to the Cow schema.
 * New cows get it automatically (schema default: true), but existing
 * documents created before this field existed don't have it stored at all -
 * this sets it to true on exactly those, so every cow ends up with an
 * explicit value.
 *
 * Usage: node scripts/backfillCowIsActive.js
 */
const mongoose = require('mongoose');
const config = require('../src/config/env');
const Cow = require('../src/models/Cow');

async function main() {
  await mongoose.connect(config.mongodbUrl);

  const result = await Cow.updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } });
  console.log(`Backfilled isActive=true on ${result.modifiedCount} cow(s).`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
