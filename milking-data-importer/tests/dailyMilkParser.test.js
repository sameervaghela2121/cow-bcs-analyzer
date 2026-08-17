const { parseDailyMilkRows, assertRequiredColumnsPresent } = require('../src/dailyMilkParser');

describe('assertRequiredColumnsPresent', () => {
  it('passes when every required column is present', () => {
    expect(() =>
      assertRequiredColumnsPresent(['Cow Number', 'Current Group', 'Afternoon', 'Evening', 'Morning', 'Total'])
    ).not.toThrow();
  });

  it('throws a user-meaningful, non-technical error listing every missing column', () => {
    expect(() => assertRequiredColumnsPresent(['Cow Number', 'Afternoon'])).toThrow(
      /missing the following column\(s\): Current Group, Evening, Morning/
    );
  });

  it('marks the error as a client-side validation problem (status 400), not a system fault', () => {
    try {
      assertRequiredColumnsPresent(['Foo', 'Bar']);
      throw new Error('expected assertRequiredColumnsPresent to throw');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });
});

describe('parseDailyMilkRows', () => {
  const MILKING_DATE = new Date(Date.UTC(2026, 7, 12)); // 12 Aug 2026

  it('explodes each row into 3 records (Morning/Afternoon/Evening), sharing cowNumber/currentGroup', () => {
    const rows = [{ 'Cow Number': 232, 'Current Group': 2.1, Afternoon: 7.86, Evening: 0, Morning: 6.81, Total: 14.67 }];

    const records = parseDailyMilkRows(rows, MILKING_DATE);

    expect(records).toHaveLength(3);
    const byShift = Object.fromEntries(records.map((r) => [r.milkingShift, r]));

    expect(byShift.Morning).toMatchObject({ cowNumber: '232', currentGroup: '2.1', milk: 6.81 });
    expect(byShift.Afternoon).toMatchObject({ cowNumber: '232', currentGroup: '2.1', milk: 7.86 });
    expect(byShift.Evening).toMatchObject({ cowNumber: '232', currentGroup: '2.1', milk: 0 });
  });

  it('dates Morning the same as the entered milkingDate, and Afternoon/Evening the day before', () => {
    const rows = [{ 'Cow Number': 232, 'Current Group': '2.1', Afternoon: 7.86, Evening: 0, Morning: 6.81 }];

    const records = parseDailyMilkRows(rows, MILKING_DATE);
    const byShift = Object.fromEntries(records.map((r) => [r.milkingShift, r]));

    expect(byShift.Morning.milkSessionAt.toISOString().slice(0, 10)).toBe('2026-08-12');
    expect(byShift.Afternoon.milkSessionAt.toISOString().slice(0, 10)).toBe('2026-08-11');
    expect(byShift.Evening.milkSessionAt.toISOString().slice(0, 10)).toBe('2026-08-11');
  });

  it('stores Cow Number as-is - no cow/organization/facility linkage', () => {
    const rows = [{ 'Cow Number': 1067, 'Current Group': '3.3', Afternoon: 4.3, Evening: 7.2, Morning: 6.33 }];

    const records = parseDailyMilkRows(rows, MILKING_DATE);

    expect(records.every((r) => r.cowNumber === '1067')).toBe(true);
    expect(records.every((r) => !('cow' in r) && !('organization' in r) && !('facility' in r))).toBe(true);
  });

  it('treats a blank shift value as 0 milk rather than skipping the record', () => {
    const rows = [{ 'Cow Number': 5, 'Current Group': '1.1', Afternoon: '', Evening: 3.2, Morning: 4.1 }];

    const records = parseDailyMilkRows(rows, MILKING_DATE);
    const afternoon = records.find((r) => r.milkingShift === 'Afternoon');

    expect(afternoon.milk).toBe(0);
  });

  it('silently skips a summary/totals row (blank Cow Number and Current Group) rather than treating it as a real cow', () => {
    const rows = [
      { 'Cow Number': 5, 'Current Group': '1.1', Afternoon: 4.3, Evening: 7.2, Morning: 6.33 },
      // "Grand Total" row as seen in real exports - blank identifiers, but
      // column sums sitting in the shift cells rather than blanks.
      { 'Cow Number': '', 'Current Group': '', Afternoon: 3662.07, Evening: 4024.73, Morning: 4373.32 },
    ];

    const records = parseDailyMilkRows(rows, MILKING_DATE);

    expect(records).toHaveLength(3);
  });

  it('throws a meaningful error and produces no records when a real row is missing its Cow Number', () => {
    const rows = [
      { 'Cow Number': 5, 'Current Group': '1.1', Afternoon: 4.3, Evening: 7.2, Morning: 6.33 },
      { 'Cow Number': '', 'Current Group': '1.2', Afternoon: 0, Evening: 1, Morning: 2 },
    ];

    expect(() => parseDailyMilkRows(rows, MILKING_DATE)).toThrow(/missing the Cow Number for row 3\./);
  });
});
