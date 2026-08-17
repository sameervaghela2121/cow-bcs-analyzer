const XLSX = require('xlsx');
const { Storage } = require('@google-cloud/storage');
const { getConnection } = require('./db');
const { parseDailyMilkRows, assertRequiredColumnsPresent } = require('./dailyMilkParser');
const { MilkingValidationError } = require('./errors');
const MilkingRecord = require('./models/MilkingRecord');
const { findOrCreateCow } = require('./cowService');
const { findOrCreateCowGroup } = require('./cowGroupService');

let storageClient;
function getStorage() {
  if (!storageClient) storageClient = new Storage();
  return storageClient;
}

// The uploader enters the milking date explicitly at upload time - it's the
// actual day the milk was recorded, not the day the file happens to be
// uploaded, and the sheet itself has no date column. Always a plain
// YYYY-MM-DD string over the wire; parsed here as UTC midnight so date-only
// arithmetic (the previous-day shift in dailyMilkParser.js) never drifts
// across a timezone boundary.
function parseMilkingDate(milkingDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(milkingDate || '').trim());
  if (!match) {
    throw new MilkingValidationError('milkingDate is required and must be in YYYY-MM-DD format.');
  }
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// Some daily exports bundle a pivot-table summary sheet ahead of the real
// per-cow data (always named "Sheet1" in the samples seen so far) - the
// actual data always lives in a sheet named "Sheet", so that's selected by
// name rather than assuming the data is always the first sheet.
function selectDataSheet(workbook) {
  return workbook.Sheets['Sheet'] || workbook.Sheets[workbook.SheetNames[0]];
}

// Resolves each row's cow/group into Cow/CowGroup references, scoped to the
// uploading facility (find-or-create against the existing Cow/CowGroup
// collections - same tables the BCS-analysis side of the app already uses).
// Cached per-import by raw string, since the sheet is one row per cow (3
// shift-records apiece) and rows commonly repeat a group - this keeps it to
// one findOrCreateCow/findOrCreateCowGroup call per *unique* cowNumber/
// currentGroup rather than one per record. A row with a blank Current Group
// gets no cowGroup ref at all rather than a group named "".
async function resolveCowAndGroupRefs(parsedRows, facilityId) {
  const cowIdByNumber = new Map();
  const groupIdByName = new Map();

  for (const row of parsedRows) {
    if (!cowIdByNumber.has(row.cowNumber)) {
      const cow = await findOrCreateCow(facilityId, row.cowNumber);
      cowIdByNumber.set(row.cowNumber, cow._id);
    }
    row.cow = cowIdByNumber.get(row.cowNumber);

    if (row.currentGroup) {
      if (!groupIdByName.has(row.currentGroup)) {
        const group = await findOrCreateCowGroup(facilityId, row.currentGroup);
        groupIdByName.set(row.currentGroup, group._id);
      }
      row.cowGroup = groupIdByName.get(row.currentGroup);
    }
  }
}

// bucketName/objectPath only locate the uploaded file in GCS - neither is
// stored on the records. facilityId is likewise never stored directly on a
// MilkingRecord; it's only used to resolve/create the cow/cowGroup
// references above, the same way facility scoping works for Cow elsewhere
// in the app.
async function importMilkingFile({ bucketName, objectPath, milkingDate, facilityId }) {
  if (!facilityId) {
    throw new MilkingValidationError('facilityId is required.');
  }

  await getConnection();

  const parsedDate = parseMilkingDate(milkingDate);

  const bucket = getStorage().bucket(bucketName);
  const [buffer] = await bucket.file(objectPath).download();

  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = selectDataSheet(workbook);
  const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  assertRequiredColumnsPresent(headerRow);
  const parsedRows = parseDailyMilkRows(rows, parsedDate);

  await resolveCowAndGroupRefs(parsedRows, facilityId);
  await MilkingRecord.insertMany(parsedRows);

  return { recordsInserted: parsedRows.length };
}

module.exports = { importMilkingFile };
