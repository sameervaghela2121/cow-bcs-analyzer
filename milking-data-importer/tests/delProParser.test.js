const { parseDelProRows } = require('../src/delProParser');

// Transcribed directly from a real DelPro export (Daily Milk Data
// 10-07-2026_Delpro.xlsx): 9 real cow rows (Animal Number 11-19), no
// trailing totals row, plus the sheet's own 'Cow Id' column - the actual
// cow-linkage field, distinct from 'Animal Number'.
const DELPRO_FIXTURE_ROWS = [
  { 'Animal Number': 11, 'Group Name': '3.1 B', 'Yield Yesterday Session 2': 9.1, 'Yield Yesterday Session 3': '', 'Yield Today Session 1': '', 'In Milk': 'Checked', 'Milk Yield Yesterday': 9.06, 'Cow Id': 'D11' },
  { 'Animal Number': 12, 'Group Name': '3.3', 'Yield Yesterday Session 2': 9.5, 'Yield Yesterday Session 3': 4.9, 'Yield Today Session 1': 3.45, 'In Milk': 'Checked', 'Milk Yield Yesterday': 17.67, 'Cow Id': 'D12' },
  { 'Animal Number': 13, 'Group Name': '3.4', 'Yield Yesterday Session 2': 9.6, 'Yield Yesterday Session 3': 6.8, 'Yield Today Session 1': 5.03, 'In Milk': 'Checked', 'Milk Yield Yesterday': 22.27, 'Cow Id': 'D13' },
  { 'Animal Number': 14, 'Group Name': '3.3', 'Yield Yesterday Session 2': 9, 'Yield Yesterday Session 3': 6.9, 'Yield Today Session 1': 5.12, 'In Milk': 'Checked', 'Milk Yield Yesterday': 22.52, 'Cow Id': 'D14' },
  { 'Animal Number': 15, 'Group Name': '3.3', 'Yield Yesterday Session 2': 9.4, 'Yield Yesterday Session 3': 6, 'Yield Today Session 1': 5.36, 'In Milk': 'Checked', 'Milk Yield Yesterday': 22.51, 'Cow Id': 'D15' },
  { 'Animal Number': 16, 'Group Name': '3.2', 'Yield Yesterday Session 2': 9.1, 'Yield Yesterday Session 3': 11.7, 'Yield Today Session 1': 5.98, 'In Milk': 'Checked', 'Milk Yield Yesterday': 26.89, 'Cow Id': 'D16' },
  { 'Animal Number': 17, 'Group Name': '3.3', 'Yield Yesterday Session 2': 9.2, 'Yield Yesterday Session 3': 5.6, 'Yield Today Session 1': 6.98, 'In Milk': 'Checked', 'Milk Yield Yesterday': 20.57, 'Cow Id': 'D17' },
  { 'Animal Number': 18, 'Group Name': '3.2', 'Yield Yesterday Session 2': 9.8, 'Yield Yesterday Session 3': 9.2, 'Yield Today Session 1': 8.09, 'In Milk': 'Checked', 'Milk Yield Yesterday': 27.21, 'Cow Id': 'D18' },
  { 'Animal Number': 19, 'Group Name': '3.2', 'Yield Yesterday Session 2': 9.8, 'Yield Yesterday Session 3': 8.7, 'Yield Today Session 1': 9.56, 'In Milk': 'Checked', 'Milk Yield Yesterday': 27.07, 'Cow Id': 'D19' },
];

describe('parseDelProRows', () => {
  it('returns exactly 9 records, one per animal', () => {
    const records = parseDelProRows(DELPRO_FIXTURE_ROWS);
    expect(records).toHaveLength(9);
    expect(records.map((r) => r.animalNumber)).toEqual(['11', '12', '13', '14', '15', '16', '17', '18', '19']);
  });

  it('never stores the "In Milk" column', () => {
    const records = parseDelProRows(DELPRO_FIXTURE_ROWS);
    for (const record of records) {
      expect(record.inMilk).toBeUndefined();
      expect(Object.keys(record)).not.toContain('In Milk');
    }
  });

  it('maps every DelPro header to its camelCase field name, and reads the cow link from Cow Id (not Animal Number)', () => {
    const records = parseDelProRows(DELPRO_FIXTURE_ROWS);
    const animal12 = records.find((r) => r.animalNumber === '12');
    expect(animal12).toMatchObject({
      source: 'DelPro',
      groupName: '3.3',
      yieldYesterdaySession2: 9.5,
      yieldYesterdaySession3: 4.9,
      yieldTodaySession1: 3.45,
      milkYieldYesterday: 17.67,
      _cowId: 'D12',
    });
  });

  it('coerces a blank Yield Today Session 1 to 0, not NaN', () => {
    const records = parseDelProRows(DELPRO_FIXTURE_ROWS);
    const animal11 = records.find((r) => r.animalNumber === '11');
    expect(animal11.yieldTodaySession1).toBe(0);
    expect(Number.isNaN(animal11.yieldTodaySession1)).toBe(false);
  });

  it('rejects the whole file - not a single record - when one row is missing its Cow Id', () => {
    const rows = DELPRO_FIXTURE_ROWS.map((row, i) => (i === 2 ? { ...row, 'Cow Id': '' } : row));
    // Fixture row 2 is spreadsheet row 4 (1 for header, 1-indexed).
    expect(() => parseDelProRows(rows)).toThrow(/missing the Cow Id for row 4\./);
  });

  it('lists every affected row when multiple rows are missing their Cow Id', () => {
    const rows = DELPRO_FIXTURE_ROWS.map((row, i) => (i === 0 || i === 4 ? { ...row, 'Cow Id': '' } : row));
    // Fixture rows 0 and 4 -> spreadsheet rows 2 and 6.
    expect(() => parseDelProRows(rows)).toThrow(/missing the Cow Id for rows 2, 6\./);
  });

  it('does not reject a row for a blank Animal Number - only Cow Id matters for linkage', () => {
    const rows = DELPRO_FIXTURE_ROWS.map((row, i) => (i === 0 ? { ...row, 'Animal Number': '' } : row));
    expect(() => parseDelProRows(rows)).not.toThrow();
    expect(parseDelProRows(rows)).toHaveLength(9);
  });

  it('reproduces the real-world bug: a file with a Cow Id column that is blank on every row is rejected entirely', () => {
    // This is exactly the shape of the actual uploaded file that caused
    // bogus Cow documents to be created from Animal Number.
    const rows = DELPRO_FIXTURE_ROWS.map((row) => ({ ...row, 'Cow Id': '' }));
    expect(() => parseDelProRows(rows)).toThrow(/missing the Cow Id for rows 2, 3, 4, 5, 6, 7, 8, 9, 10\./);
  });
});
