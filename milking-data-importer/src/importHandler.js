const XLSX = require('xlsx');
const { Storage } = require('@google-cloud/storage');
const { getConnection } = require('./db');
const { detectFormat } = require('./formatDetector');
const { assertCowIdColumnPresent } = require('./cowIdColumn');
const { parseScrRows } = require('./scrParser');
const { parseDelProRows } = require('./delProParser');
const { findOrCreateCow } = require('./cowService');
const MilkingRecord = require('./models/MilkingRecord');

let storageClient;
function getStorage() {
  if (!storageClient) storageClient = new Storage();
  return storageClient;
}

async function importMilkingFile({ bucketName, objectPath }) {
  await getConnection();

  const bucket = getStorage().bucket(bucketName);
  const [buffer] = await bucket.file(objectPath).download();

  // cellDates: false - SCR's Date column is parsed explicitly as DD-MM-YYYY
  // by scrParser, not via xlsx's own (locale-ambiguous) date coercion.
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const source = detectFormat(headerRow);
  // Whole-file gate, before a single row is parsed: no Cow Id column, no
  // import - see cowIdColumn.js for why this is a dedicated column rather
  // than the sheet's own Cow Number/Animal Number field.
  assertCowIdColumnPresent(headerRow);

  const parsedRows = source === 'SCR' ? parseScrRows(rows) : parseDelProRows(rows);

  // Resolve each row's cow reference from its parsed _cowId (find-or-create),
  // cached per unique id so a cow appearing in multiple rows (e.g. SCR's
  // separate shift rows) is only looked up/created once.
  const cowCache = new Map();
  for (const row of parsedRows) {
    const cowsId = row._cowId;
    if (!cowCache.has(cowsId)) {
      cowCache.set(cowsId, await findOrCreateCow(cowsId));
    }
    row.cow = cowCache.get(cowsId)._id;
    delete row._cowId;
  }

  await MilkingRecord.insertMany(parsedRows.map((row) => ({ ...row, sourceObjectPath: objectPath })));

  return { source, recordsInserted: parsedRows.length };
}

module.exports = { importMilkingFile };
