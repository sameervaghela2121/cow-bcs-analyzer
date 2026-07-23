const HEADER_TO_FIELD = {
  'Cow Number': 'cowNumber',
  'Current Group': 'currentGroup',
  'Shift Yield': 'shiftYield',
  Date: 'date',
  Shift: 'shift',
  'Shift Yield -1': 'shiftYield1',
  'Shift Yield -2': 'shiftYield2',
  'Shift Yield -3': 'shiftYield3',
};

const NUMBER_FIELDS = new Set(['shiftYield', 'shiftYield1', 'shiftYield2', 'shiftYield3']);

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

// SCR's sample date column ("10-07-2026") is ambiguous between DD-MM-YYYY
// and MM-DD-YYYY - parsed explicitly as DD-MM-YYYY (this is an Indian dairy
// operation's export) rather than trusting a locale-dependent Date() parse.
function parseScrDate(raw) {
  const match = String(raw).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

// A row is a real cow record only if both Date and Current Group are
// non-blank - SCR's trailing totals row repeats the last Cow Number but
// leaves both of those blank while holding column sums instead.
function parseScrRows(rows) {
  const records = [];
  for (const row of rows) {
    if (isBlank(row['Date']) || isBlank(row['Current Group'])) continue;

    const record = { source: 'SCR' };
    for (const [header, field] of Object.entries(HEADER_TO_FIELD)) {
      const raw = row[header];
      if (field === 'date') {
        record.date = parseScrDate(raw);
      } else if (NUMBER_FIELDS.has(field)) {
        record[field] = isBlank(raw) ? 0 : Number(raw);
      } else {
        record[field] = String(raw).trim();
      }
    }
    records.push(record);
  }
  return records;
}

module.exports = { parseScrRows };
