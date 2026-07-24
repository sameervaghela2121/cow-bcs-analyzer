const { MilkingValidationError } = require('./errors');

// The column that identifies which cow a row belongs to - deliberately a
// dedicated "Cow Id" column, NOT the sheet's own "Cow Number"/"Animal
// Number" field. Those stay plain report data on the record; only "Cow Id"
// is used to find (or create) the linked Cow document.
const COW_ID_HEADER = 'Cow Id';

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

// Whole-file gate: if the sheet has no "Cow Id" column at all, reject it
// before a single row is parsed - nothing gets written to cows or
// milking_records.
function assertCowIdColumnPresent(headerRow) {
  const normalized = (headerRow || []).map((h) => String(h || '').trim());
  if (!normalized.includes(COW_ID_HEADER)) {
    throw new MilkingValidationError(
      'This file has no "Cow Id" column, so we can\'t tell which cow each row belongs to. Please add a Cow Id column with a value for every row and re-upload the file. No records were imported.'
    );
  }
}

// Whole-file gate: if any real row is missing its Cow Id, reject the whole
// file - not a single record saved - so the farm can fix the file and
// re-upload rather than silently ending up with partial data.
function throwIfMissingCowIds(missingRows) {
  if (missingRows.length === 0) return;
  const rowWord = missingRows.length > 1 ? 'rows' : 'row';
  throw new MilkingValidationError(
    `This file is missing the Cow Id for ${rowWord} ${missingRows.join(', ')}. Please fill in the Cow Id for every row and re-upload the file. No records were imported.`
  );
}

module.exports = { COW_ID_HEADER, isBlank, assertCowIdColumnPresent, throwIfMissingCowIds };
