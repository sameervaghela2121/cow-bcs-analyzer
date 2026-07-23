const { detectFormat } = require('../src/formatDetector');

describe('detectFormat', () => {
  it('detects SCR when the header row contains "Cow Number"', () => {
    expect(detectFormat(['Cow Number', 'Current Group', 'Shift Yield'])).toBe('SCR');
  });

  it('detects DelPro when the header row contains "Animal Number"', () => {
    expect(detectFormat(['Animal Number', 'Group Name'])).toBe('DelPro');
  });

  it('throws for an unrecognized header row', () => {
    expect(() => detectFormat(['Foo', 'Bar'])).toThrow(/Unrecognized milking sheet format/);
  });
});
