const { COW_ID_HEADER, isBlank, throwIfMissingCowIds } = require('./cowIdColumn');

const HEADER_TO_FIELD = {
  'Animal Number': 'animalNumber',
  'Group Name': 'groupName',
  'Yield Yesterday Session 2': 'yieldYesterdaySession2',
  'Yield Yesterday Session 3': 'yieldYesterdaySession3',
  'Yield Today Session 1': 'yieldTodaySession1',
  'Milk Yield Yesterday': 'milkYieldYesterday',
};

// 'In Milk' is intentionally absent from HEADER_TO_FIELD - never stored, per
// instruction that in-milk counts are computed separately, not from this sheet.

const NUMBER_FIELDS = new Set(['yieldYesterdaySession2', 'yieldYesterdaySession3', 'yieldTodaySession1', 'milkYieldYesterday']);

// Every row is checked against the dedicated Cow Id column (see
// cowIdColumn.js) - Animal Number stays plain report data and is no longer
// used to identify the cow.
function parseDelProRows(rows) {
  const records = [];
  const missingCowIdRows = [];

  rows.forEach((row, index) => {
    // +2: 0-indexed row + the header row that sits above the data in the sheet.
    const excelRow = index + 2;
    if (isBlank(row[COW_ID_HEADER])) {
      missingCowIdRows.push(excelRow);
      return;
    }

    // _cowId is transient - read by importHandler.js to find-or-create the
    // linked Cow, then stripped before the record is saved.
    const record = { source: 'DelPro', _cowId: String(row[COW_ID_HEADER]).trim() };
    for (const [header, field] of Object.entries(HEADER_TO_FIELD)) {
      const raw = row[header];
      if (NUMBER_FIELDS.has(field)) {
        record[field] = isBlank(raw) ? 0 : Number(raw);
      } else {
        record[field] = String(raw).trim();
      }
    }
    records.push(record);
  });

  throwIfMissingCowIds(missingCowIdRows);

  return records;
}

module.exports = { parseDelProRows };
