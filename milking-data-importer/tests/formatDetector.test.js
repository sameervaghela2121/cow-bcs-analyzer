const { detectFormat } = require('../src/formatDetector');

describe('detectFormat', () => {
  it('detects SCR when the header row contains "Cow Number"', () => {
    expect(detectFormat(['Cow Number', 'Current Group', 'Shift Yield'])).toBe('SCR');
  });

  it('detects DelPro when the header row contains "Animal Number"', () => {
    expect(detectFormat(['Animal Number', 'Group Name'])).toBe('DelPro');
  });

  it('throws a user-meaningful, non-technical error for an unrecognized header row', () => {
    expect(() => detectFormat(['Foo', 'Bar'])).toThrow(/no "Cow Number" or "Animal Number" column/);
  });

  it('marks the error as a client-side validation problem (status 400), not a system fault', () => {
    try {
      detectFormat(['Foo', 'Bar']);
      throw new Error('expected detectFormat to throw');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });
});
