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
  it('maps high/medium/low to the prototype colors', () => {
    expect(confidenceStyleFor('high').background).toBe('#166534');
    expect(confidenceStyleFor('medium').background).toBe('#a35a05');
    expect(confidenceStyleFor('low').background).toBe('#b91c1c');
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
    expect(THEME['--bg-page']).toBe('#f6f5f0');
  });
});
