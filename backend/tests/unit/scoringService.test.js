const { roundQuarter, bandFor, isSharpDrop, reconcileProviders } = require('../../src/services/scoringService');

describe('roundQuarter', () => {
  it('rounds to the nearest 0.25', () => {
    expect(roundQuarter(3.1)).toBe(3.0);
    expect(roundQuarter(3.13)).toBe(3.25);
    expect(roundQuarter(3.4)).toBe(3.5);
  });
});

describe('bandFor', () => {
  it('classifies scores into thin/ideal/heavy', () => {
    expect(bandFor(2.25)).toBe('thin');
    expect(bandFor(2.5)).toBe('ideal');
    expect(bandFor(3.75)).toBe('ideal');
    expect(bandFor(4.0)).toBe('heavy');
  });
});

describe('isSharpDrop', () => {
  it('flags a drop of 0.5 or more', () => {
    expect(isSharpDrop(3.5, 3.0)).toBe(true);
    expect(isSharpDrop(3.5, 3.25)).toBe(false);
  });
  it('returns false when there is no previous score', () => {
    expect(isSharpDrop(null, 3.0)).toBe(false);
  });
});

describe('reconcileProviders', () => {
  it('takes the median of successful providers and reports high confidence on tight agreement', () => {
    const result = reconcileProviders({
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      gemini: { final_bcs: 3.5, confidence: 'High', status: 'success', error_message: null },
      openai: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
    });
    expect(result.status).toBe('scored');
    expect(result.score).toBe(3.25);
    expect(result.confidence).toBe('high');
    expect(result.flagged).toBe(false);
    expect(result.providerResults).toHaveLength(3);
  });

  it('reports low confidence and flags when providers disagree widely', () => {
    const result = reconcileProviders({
      claude: { final_bcs: 2.5, confidence: 'High', status: 'success', error_message: null },
      gemini: { final_bcs: 4.0, confidence: 'High', status: 'success', error_message: null },
      openai: { final_bcs: 3.25, confidence: 'Medium', status: 'success', error_message: null },
    });
    expect(result.confidence).toBe('low');
    expect(result.flagged).toBe(true);
  });

  it('flags low confidence when fewer than 2 providers succeed', () => {
    const result = reconcileProviders({
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      gemini: { status: 'error', error_message: 'timeout' },
      openai: { status: 'error', error_message: 'rate limited' },
    });
    expect(result.status).toBe('scored');
    expect(result.confidence).toBe('low');
    expect(result.flagged).toBe(true);
    expect(result.score).toBe(3.25);
  });

  it('returns status failed when every provider fails', () => {
    const result = reconcileProviders({
      claude: { status: 'error', error_message: 'a' },
      gemini: { status: 'error', error_message: 'b' },
      openai: { status: 'error', error_message: 'c' },
    });
    expect(result.status).toBe('failed');
    expect(result.score).toBeUndefined();
  });
});
