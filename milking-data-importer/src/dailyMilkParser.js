const { MilkingValidationError } = require('./errors');

const SHIFTS = ['Morning', 'Afternoon', 'Evening'];
const REQUIRED_HEADERS = ['Cow Number', 'Current Group', 'Afternoon', 'Evening', 'Morning'];

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

// A row with both Cow Number and Current Group blank isn't a real cow row -
// it's either a trailing blank-row artifact, or (as seen in real exports) a
// "Grand Total" row the pivot leaves at the bottom, with column sums sitting
// in the shift cells instead of blanks. Either way it's silently skipped,
// same as SCR's old totals-row exclusion. A row with a blank Cow Number but
// a real Current Group is a genuine problem and still errors below.
function isSummaryRow(row) {
  return isBlank(row['Cow Number']) && isBlank(row['Current Group']);
}

// Whole-file gate, before a single row is parsed: this format's shape is
// fixed (unlike the old SCR/DelPro exports, there's only one system now), so
// a missing column means the wrong file was uploaded entirely.
function assertRequiredColumnsPresent(headerRow) {
  const normalized = (headerRow || []).map((h) => String(h || '').trim());
  const missing = REQUIRED_HEADERS.filter((h) => !normalized.includes(h));
  if (missing.length > 0) {
    throw new MilkingValidationError(
      `This file is missing the following column(s): ${missing.join(', ')}. Please check the file and try again.`
    );
  }
}

// The sheet is wide: one row per cow holds all three shifts' yields as
// separate columns (Afternoon/Evening/Morning), not one row per shift. Each
// row explodes into 3 MilkingRecord documents here, sharing cowNumber/
// currentGroup and differing by milkingShift/milk/milkSessionAt.
//
// milkingDate is the date the uploader entered for this file (the actual
// milking day), not a timestamp read from the sheet - the sheet has no date
// column of its own. A farm importing data in the morning is reporting that
// morning's session plus the previous evening's Afternoon/Evening sessions,
// so only Morning gets milkingDate itself; Afternoon/Evening get the day before.
function parseDailyMilkRows(rows, milkingDate) {
  const previousDay = new Date(milkingDate);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const sessionDateForShift = { Morning: milkingDate, Afternoon: previousDay, Evening: previousDay };

  const records = [];
  const missingCowNumberRows = [];

  rows.forEach((row, index) => {
    if (isSummaryRow(row)) return;

    // +2: 0-indexed row + the header row that sits above the data in the sheet.
    const excelRow = index + 2;
    if (isBlank(row['Cow Number'])) {
      missingCowNumberRows.push(excelRow);
      return;
    }

    const cowNumber = String(row['Cow Number']).trim();
    const currentGroup = isBlank(row['Current Group']) ? '' : String(row['Current Group']).trim();

    for (const shift of SHIFTS) {
      records.push({
        cowNumber,
        currentGroup,
        milkingShift: shift,
        milk: isBlank(row[shift]) ? 0 : Number(row[shift]),
        milkSessionAt: sessionDateForShift[shift],
      });
    }
  });

  if (missingCowNumberRows.length > 0) {
    const rowWord = missingCowNumberRows.length > 1 ? 'rows' : 'row';
    throw new MilkingValidationError(
      `This file is missing the Cow Number for ${rowWord} ${missingCowNumberRows.join(', ')}. Please fill in the Cow Number for every row and re-upload the file. No records were imported.`
    );
  }

  return records;
}

module.exports = { parseDailyMilkRows, assertRequiredColumnsPresent };
