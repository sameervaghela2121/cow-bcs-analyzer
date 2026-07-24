const { parseScrRows } = require('../src/scrParser');

// Transcribed directly from the confirmed SCR screenshot: 4 real cow rows
// (Cow Number 1-4) followed by a totals row that repeats Cow Number 4 but
// leaves Date and Current Group blank while holding column sums instead.
// 'Cow Id' is the dedicated cow-linkage column, deliberately given different
// values than 'Cow Number' to prove the two are never conflated.
const SCR_FIXTURE_ROWS = [
  { 'Cow Number': 1, 'Current Group': '2.2A', 'Shift Yield': 1.1, Date: '10-07-2026', Shift: 'Morning', 'Shift Yield -1': 2.8, 'Shift Yield -2': 8.3, 'Shift Yield -3': '', 'Cow Id': 'C1' },
  { 'Cow Number': 2, 'Current Group': '2.2A', 'Shift Yield': 9.5, Date: '10-07-2026', Shift: 'Morning', 'Shift Yield -1': 8.2, 'Shift Yield -2': 6.2, 'Shift Yield -3': 0, 'Cow Id': 'C2' },
  { 'Cow Number': 3, 'Current Group': '1.2A', 'Shift Yield': 6.9, Date: '10-07-2026', Shift: 'Morning', 'Shift Yield -1': 4.1, 'Shift Yield -2': 6, 'Shift Yield -3': 5.4, 'Cow Id': 'C3' },
  { 'Cow Number': 4, 'Current Group': '1.3', 'Shift Yield': 4.9, Date: '10-07-2026', Shift: 'Morning', 'Shift Yield -1': 4.7, 'Shift Yield -2': 3.5, 'Shift Yield -3': 3.9, 'Cow Id': 'C4' },
  { 'Cow Number': 4, 'Current Group': '', 'Shift Yield': 22.29, Date: '', Shift: '', 'Shift Yield -1': 19.75, 'Shift Yield -2': 24.01, 'Shift Yield -3': '', 'Cow Id': 'C4' },
];

describe('parseScrRows', () => {
  it('excludes the trailing totals row, returning exactly 4 records', () => {
    const records = parseScrRows(SCR_FIXTURE_ROWS);
    expect(records).toHaveLength(4);
    expect(records.map((r) => r.cowNumber)).toEqual(['1', '2', '3', '4']);
  });

  it('maps every SCR header to its camelCase field name, and reads the cow link from Cow Id (not Cow Number)', () => {
    const [first] = parseScrRows(SCR_FIXTURE_ROWS);
    expect(first).toMatchObject({
      source: 'SCR',
      cowNumber: '1',
      currentGroup: '2.2A',
      shiftYield: 1.1,
      shift: 'Morning',
      shiftYield1: 2.8,
      shiftYield2: 8.3,
      shiftYield3: 0,
      _cowId: 'C1',
    });
  });

  it('parses the Date column as DD-MM-YYYY, not MM-DD-YYYY', () => {
    const [first] = parseScrRows(SCR_FIXTURE_ROWS);
    // '10-07-2026' -> July 10th 2026, not October 7th.
    expect(first.date.getUTCFullYear()).toBe(2026);
    expect(first.date.getUTCMonth()).toBe(6); // 0-indexed: 6 = July
    expect(first.date.getUTCDate()).toBe(10);
  });

  it('coerces a blank Shift Yield -3 to 0, not NaN', () => {
    const [first] = parseScrRows(SCR_FIXTURE_ROWS);
    expect(first.shiftYield3).toBe(0);
    expect(Number.isNaN(first.shiftYield3)).toBe(false);
  });

  it('rejects the whole file - not a single record - when one real row is missing its Cow Id', () => {
    const rows = SCR_FIXTURE_ROWS.map((row, i) => (i === 1 ? { ...row, 'Cow Id': '' } : row));
    // Row 2 in the fixture array is spreadsheet row 3 (1 for header, 1-indexed).
    expect(() => parseScrRows(rows)).toThrow(/missing the Cow Id for row 3\./);
  });

  it('lists every affected row when multiple rows are missing their Cow Id', () => {
    const rows = SCR_FIXTURE_ROWS.map((row, i) => (i === 0 || i === 2 ? { ...row, 'Cow Id': '' } : row));
    // Fixture rows 0 and 2 -> spreadsheet rows 2 and 4.
    expect(() => parseScrRows(rows)).toThrow(/missing the Cow Id for rows 2, 4\./);
  });

  it('does not mistake the excluded totals row for a row with a missing Cow Id', () => {
    // The totals row (index 4) keeps its Cow Id but has blank Date/Current
    // Group - it must stay silently excluded, not surface in the error list.
    expect(() => parseScrRows(SCR_FIXTURE_ROWS)).not.toThrow();
    expect(parseScrRows(SCR_FIXTURE_ROWS)).toHaveLength(4);
  });

  it('does not reject a row for a blank Cow Number - only Cow Id matters for linkage', () => {
    const rows = SCR_FIXTURE_ROWS.map((row, i) => (i === 0 ? { ...row, 'Cow Number': '' } : row));
    expect(() => parseScrRows(rows)).not.toThrow();
    expect(parseScrRows(rows)).toHaveLength(4);
  });
});
