const XLSX = require('xlsx');
const { Storage } = require('@google-cloud/storage');
const { getConnection } = require('./db');
const { detectFormat } = require('./formatDetector');
const { parseScrRows } = require('./scrParser');
const { parseDelProRows } = require('./delProParser');
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
  const parsedRows = source === 'SCR' ? parseScrRows(rows) : parseDelProRows(rows);

  // No Cow lookup/creation and no cow reference stored - each row is
  // inserted standalone for now.
  await MilkingRecord.insertMany(parsedRows.map((row) => ({ ...row, sourceObjectPath: objectPath })));

  return { source, recordsInserted: parsedRows.length };
}

module.exports = { importMilkingFile };
