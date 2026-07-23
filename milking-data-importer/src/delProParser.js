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

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

// Unlike SCR, the DelPro sample sheet has no trailing totals row - every row
// is a real record as long as it actually identifies a cow.
function parseDelProRows(rows) {
  const records = [];
  for (const row of rows) {
    if (isBlank(row['Animal Number'])) continue;

    const record = { source: 'DelPro' };
    for (const [header, field] of Object.entries(HEADER_TO_FIELD)) {
      const raw = row[header];
      if (NUMBER_FIELDS.has(field)) {
        record[field] = isBlank(raw) ? 0 : Number(raw);
      } else {
        record[field] = String(raw).trim();
      }
    }
    records.push(record);
  }
  return records;
}

module.exports = { parseDelProRows };
