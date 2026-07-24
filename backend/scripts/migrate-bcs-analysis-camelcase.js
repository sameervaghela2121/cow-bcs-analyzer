/**
 * One-off migration: renames bcs_analysis's snake_case fields to camelCase
 * and drops the denormalized cowsId (the Cow document, via the `cow` ref,
 * is now the only source of truth for a cow's id). Also renames the same
 * keys inside audit_logs' before/after snapshots, so historical audit
 * entries read with the same field names the app now uses everywhere else.
 *
 * Usage:
 *   node scripts/migrate-bcs-analysis-camelcase.js            # dry run - reports counts only, writes nothing
 *   node scripts/migrate-bcs-analysis-camelcase.js --execute  # performs the writes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/env');

const EXECUTE = process.argv.includes('--execute');

const PROVIDERS = ['claude', 'gemini', 'openai'];

function providerRenames(prefix) {
  const renames = {};
  for (const p of PROVIDERS) {
    renames[`${prefix}.${p}.final_bcs`] = `${prefix}.${p}.finalBcs`;
    renames[`${prefix}.${p}.is_true`] = `${prefix}.${p}.isTrue`;
    renames[`${prefix}.${p}.error_message`] = `${prefix}.${p}.errorMessage`;
  }
  return renames;
}

const BCS_ANALYSIS_RENAME = {
  final_bcs: 'finalBcs',
  is_approved: 'isApproved',
  'bcsScore.is_mean_true': 'bcsScore.isMeanAccurate',
  'bcsScore.is_median_true': 'bcsScore.isMedianAccurate',
  'bcsScore.is_critical': 'bcsScore.isCritical',
  ...providerRenames('bcsScore'),
};

const AUDIT_LOG_RENAME = {
  'before.final_bcs': 'before.finalBcs',
  'before.is_approved': 'before.isApproved',
  'before.bcsScore.is_mean_true': 'before.bcsScore.isMeanAccurate',
  'before.bcsScore.is_median_true': 'before.bcsScore.isMedianAccurate',
  'before.bcsScore.is_critical': 'before.bcsScore.isCritical',
  ...providerRenames('before.bcsScore'),
  'after.final_bcs': 'after.finalBcs',
  'after.is_approved': 'after.isApproved',
  'after.bcsScore.is_mean_true': 'after.bcsScore.isMeanAccurate',
  'after.bcsScore.is_median_true': 'after.bcsScore.isMedianAccurate',
  'after.bcsScore.is_critical': 'after.bcsScore.isCritical',
  ...providerRenames('after.bcsScore'),
};

async function main() {
  await mongoose.connect(config.mongodbUrl);
  const db = mongoose.connection.db;

  const bcsAnalysisTotal = await db.collection('bcs_analysis').countDocuments();
  const bcsAnalysisWithCowsId = await db.collection('bcs_analysis').countDocuments({ cowsId: { $exists: true } });
  const bcsAnalysisWithOldFinalBcs = await db.collection('bcs_analysis').countDocuments({ final_bcs: { $exists: true } });
  const auditLogTotal = await db.collection('audit_logs').countDocuments();
  const auditLogWithOldFields = await db.collection('audit_logs').countDocuments({
    $or: [{ 'before.final_bcs': { $exists: true } }, { 'after.final_bcs': { $exists: true } }],
  });

  console.log(`bcs_analysis: ${bcsAnalysisTotal} total, ${bcsAnalysisWithCowsId} with cowsId to drop, ${bcsAnalysisWithOldFinalBcs} with old-style final_bcs to rename`);
  console.log(`audit_logs: ${auditLogTotal} total, ${auditLogWithOldFields} with old-style before/after fields to rename`);

  if (!EXECUTE) {
    console.log('\nDry run only - no writes performed. Re-run with --execute to apply.');
    await mongoose.connection.close();
    return;
  }

  const bcsResult = await db.collection('bcs_analysis').updateMany(
    {},
    { $rename: BCS_ANALYSIS_RENAME, $unset: { cowsId: '' } }
  );
  console.log(`bcs_analysis: matched ${bcsResult.matchedCount}, modified ${bcsResult.modifiedCount}`);

  const auditResult = await db.collection('audit_logs').updateMany(
    {},
    { $rename: AUDIT_LOG_RENAME }
  );
  console.log(`audit_logs: matched ${auditResult.matchedCount}, modified ${auditResult.modifiedCount}`);

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
