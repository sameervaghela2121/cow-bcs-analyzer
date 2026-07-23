const { parseScrRows } = require('../src/scrParser');

// Transcribed directly from the confirmed SCR screenshot: 4 real cow rows
// (Cow Number 1-4) followed by a totals row that repeats Cow Number 4 but
// leaves Date and Current Group blank while holding column sums instead.
const SCR_FIXTURE_ROWS = [
  { 'Cow Number': 1, 'Current Group': '2.2A', 'Shift Yield': 1.1, Date: '10-07-2026', Shift: 'Morning', 'Shift Yield -1': 2.8, 'Shift Yield -2': 8.3, 'Shift Yield -3': '' },
  { 'Cow Number': 2, 'Current Group': '2.2A', 'Shift Yield': 9.5, Date: '10-07-2026', Shift: 'Morning', 'Shift Yield -1': 8.2, 'Shift Yield -2': 6.2, 'Shift Yield -3': 0 },
  { 'Cow Number': 3, 'Current Group': '1.2A', 'Shift Yield': 6.9, Date: '10-07-2026', Shift: 'Morning', 'Shift Yield -1': 4.1, 'Shift Yield -2': 6, 'Shift Yield -3': 5.4 },
  { 'Cow Number': 4, 'Current Group': '1.3', 'Shift Yield': 4.9, Date: '10-07-2026', Shift: 'Morning', 'Shift Yield -1': 4.7, 'Shift Yield -2': 3.5, 'Shift Yield -3': 3.9 },
  { 'Cow Number': 4, 'Current Group': '', 'Shift Yield': 22.29, Date: '', Shift: '', 'Shift Yield -1': 19.75, 'Shift Yield -2': 24.01, 'Shift Yield -3': '' },
];

describe('parseScrRows', () => {
  it('excludes the trailing totals row, returning exactly 4 records', () => {
    const records = parseScrRows(SCR_FIXTURE_ROWS);
    expect(records).toHaveLength(4);
    expect(records.map((r) => r.cowNumber)).toEqual(['1', '2', '3', '4']);
  });

  it('maps every SCR header to its camelCase field name', () => {
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
});
