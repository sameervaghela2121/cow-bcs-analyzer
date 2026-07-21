import { bandFor, confidenceStyleFor, formatScore, THEME } from '../../src/domain/bcs.js';

describe('bandFor', () => {
  it('classifies thin/ideal/heavy at the exact boundaries', () => {
    expect(bandFor(2.25).key).toBe('thin');
    expect(bandFor(2.5).key).toBe('ideal');
    expect(bandFor(3.75).key).toBe('ideal');
    expect(bandFor(4.0).key).toBe('heavy');
  });

  it('returns an unscored band for null/undefined instead of throwing', () => {
    expect(bandFor(null).key).toBe('unscored');
    expect(bandFor(undefined).key).toBe('unscored');
  });
});

describe('confidenceStyleFor', () => {
  it('maps high/medium/low to the design system status colors', () => {
    expect(confidenceStyleFor('high').color).toBe('#43A047');
    expect(confidenceStyleFor('medium').color).toBe('#F9A825');
    expect(confidenceStyleFor('low').color).toBe('#D32F2F');
  });
});

describe('formatScore', () => {
  it('trims trailing zero but keeps one decimal for whole numbers', () => {
    expect(formatScore(3.5)).toBe('3.5');
    expect(formatScore(3.0)).toBe('3.0');
    expect(formatScore(3.25)).toBe('3.25');
  });

  it('returns a placeholder for null/undefined instead of throwing', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(undefined)).toBe('—');
  });
});

describe('THEME', () => {
  it('has the core css vars for the (only) light palette', () => {
    expect(THEME['--bg-page']).toBe('#F7F8F5');
  });
});
