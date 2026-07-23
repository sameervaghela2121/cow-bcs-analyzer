const { parseDelProRows } = require('../src/delProParser');

// Transcribed directly from the confirmed DelPro screenshot: 9 real cow rows
// (Animal Number 11-19), no trailing totals row in this sheet.
const DELPRO_FIXTURE_ROWS = [
  { 'Animal Number': 11, 'Group Name': '3.1 B', 'Yield Yesterday Session 2': 9.1, 'Yield Yesterday Session 3': '', 'Yield Today Session 1': '', 'In Milk': 'Checked', 'Milk Yield Yesterday': 9.06 },
  { 'Animal Number': 12, 'Group Name': '3.3', 'Yield Yesterday Session 2': 9.5, 'Yield Yesterday Session 3': 4.9, 'Yield Today Session 1': 3.45, 'In Milk': 'Checked', 'Milk Yield Yesterday': 17.67 },
  { 'Animal Number': 13, 'Group Name': '3.4', 'Yield Yesterday Session 2': 9.6, 'Yield Yesterday Session 3': 6.8, 'Yield Today Session 1': 5.03, 'In Milk': 'Checked', 'Milk Yield Yesterday': 22.27 },
  { 'Animal Number': 14, 'Group Name': '3.3', 'Yield Yesterday Session 2': 9, 'Yield Yesterday Session 3': 6.9, 'Yield Today Session 1': 5.12, 'In Milk': 'Checked', 'Milk Yield Yesterday': 22.52 },
  { 'Animal Number': 15, 'Group Name': '3.3', 'Yield Yesterday Session 2': 9.4, 'Yield Yesterday Session 3': 6, 'Yield Today Session 1': 5.36, 'In Milk': 'Checked', 'Milk Yield Yesterday': 22.51 },
  { 'Animal Number': 16, 'Group Name': '3.2', 'Yield Yesterday Session 2': 9.1, 'Yield Yesterday Session 3': 11.7, 'Yield Today Session 1': 5.98, 'In Milk': 'Checked', 'Milk Yield Yesterday': 26.89 },
  { 'Animal Number': 17, 'Group Name': '3.3', 'Yield Yesterday Session 2': 9.2, 'Yield Yesterday Session 3': 5.6, 'Yield Today Session 1': 6.98, 'In Milk': 'Checked', 'Milk Yield Yesterday': 20.57 },
  { 'Animal Number': 18, 'Group Name': '3.2', 'Yield Yesterday Session 2': 9.8, 'Yield Yesterday Session 3': 9.2, 'Yield Today Session 1': 8.09, 'In Milk': 'Checked', 'Milk Yield Yesterday': 27.21 },
  { 'Animal Number': 19, 'Group Name': '3.2', 'Yield Yesterday Session 2': 9.8, 'Yield Yesterday Session 3': 8.7, 'Yield Today Session 1': 9.56, 'In Milk': 'Checked', 'Milk Yield Yesterday': 27.07 },
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

  it('maps every DelPro header to its camelCase field name', () => {
    const records = parseDelProRows(DELPRO_FIXTURE_ROWS);
    const animal12 = records.find((r) => r.animalNumber === '12');
    expect(animal12).toMatchObject({
      source: 'DelPro',
      groupName: '3.3',
      yieldYesterdaySession2: 9.5,
      yieldYesterdaySession3: 4.9,
      yieldTodaySession1: 3.45,
      milkYieldYesterday: 17.67,
    });
  });

  it('coerces a blank Yield Today Session 1 to 0, not NaN', () => {
    const records = parseDelProRows(DELPRO_FIXTURE_ROWS);
    const animal11 = records.find((r) => r.animalNumber === '11');
    expect(animal11.yieldTodaySession1).toBe(0);
    expect(Number.isNaN(animal11.yieldTodaySession1)).toBe(false);
  });
});
