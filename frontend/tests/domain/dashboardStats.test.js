import {
  effectiveScore, latestAnalysisPerCow, bcsDistribution, pipelineStatusCounts,
  reviewerAgreementStats, modelInfluenceStats, scoreTrend, cowsNeedingAttention, scoreVolatility, reviewBacklog,
} from '../../src/domain/dashboardStats.js';

describe('effectiveScore', () => {
  it('prefers final_bcs once a reviewer has decided, over any live preview', () => {
    expect(effectiveScore({
      final_bcs: 3.5,
      bcsScore: { claude: { status: 'success', final_bcs: 2.0 } },
    })).toBe(3.5);
  });

  it('before any review, computes the live median fresh from whichever providers succeeded', () => {
    expect(effectiveScore({
      final_bcs: null,
      bcsScore: {
        claude: { status: 'success', final_bcs: 2.0 },
        gemini: { status: 'success', final_bcs: 3.0 },
        openai: { status: 'success', final_bcs: 4.0 },
      },
    })).toBe(3.0); // median of [2.0, 3.0, 4.0]
  });

  it('returns null when there is nothing to go on', () => {
    expect(effectiveScore({ bcsScore: {} })).toBeNull();
    expect(effectiveScore({})).toBeNull();
  });
});

describe('latestAnalysisPerCow', () => {
  it('keeps only the most recent analysis per cowsId', () => {
    const latest = latestAnalysisPerCow([
      { cowsId: '1001', createdAt: '2026-01-01T00:00:00Z', final_bcs: 3.0 },
      { cowsId: '1001', createdAt: '2026-02-01T00:00:00Z', final_bcs: 3.5 },
      { cowsId: '1002', createdAt: '2026-01-15T00:00:00Z', final_bcs: 2.0 },
    ]);
    expect(latest.get('1001').final_bcs).toBe(3.5);
    expect(latest.get('1002').final_bcs).toBe(2.0);
  });
});

describe('bcsDistribution', () => {
  it('buckets each cow into thin/ideal/heavy/unscored', () => {
    const latest = new Map([
      ['1001', { final_bcs: 2.0 }],
      ['1002', { final_bcs: 3.0 }],
      ['1003', { final_bcs: 4.0 }],
      ['1004', { bcsScore: {} }],
    ]);
    expect(bcsDistribution(latest)).toEqual({ thin: 1, ideal: 1, heavy: 1, unscored: 1 });
  });
});

describe('pipelineStatusCounts', () => {
  it('counts analyses by status', () => {
    const counts = pipelineStatusCounts([
      { status: 'completed' }, { status: 'completed' }, { status: 'processing' }, { status: 'failed' },
    ]);
    expect(counts).toEqual({ not_started: 0, processing: 1, completed: 2, failed: 1 });
  });
});

describe('reviewerAgreementStats', () => {
  it('counts a matched median (nothing else coincided) as "median"', () => {
    const agreement = reviewerAgreementStats([{
      is_approved: true,
      final_bcs: 2.25,
      bcsScore: {
        is_median_true: true, is_mean_true: false,
        claude: { is_true: false }, gemini: { is_true: false }, openai: { is_true: false },
      },
    }]);
    expect(agreement.find((a) => a.key === 'median')).toEqual({ key: 'median', count: 1, rate: 1 });
    expect(agreement.find((a) => a.key === 'mean').count).toBe(0);
    expect(agreement.find((a) => a.key === 'override').count).toBe(0);
  });

  it('counts a matched mean as "mean"', () => {
    const agreement = reviewerAgreementStats([{
      is_approved: true,
      final_bcs: 2.75,
      bcsScore: { is_mean_true: true, is_median_true: false },
    }]);
    expect(agreement.find((a) => a.key === 'mean')).toEqual({ key: 'mean', count: 1, rate: 1 });
    expect(agreement.find((a) => a.key === 'median').count).toBe(0);
  });

  it('counts a manual override (nothing matched at all) as "override"', () => {
    const agreement = reviewerAgreementStats([{
      is_approved: true,
      final_bcs: 3.5,
      bcsScore: { is_median_true: false, is_mean_true: false, claude: { is_true: false } },
    }]);
    expect(agreement.find((a) => a.key === 'override')).toEqual({ key: 'override', count: 1, rate: 1 });
    expect(agreement.find((a) => a.key === 'median').count).toBe(0);
    expect(agreement.find((a) => a.key === 'mean').count).toBe(0);
  });

  it('credits multiple buckets at once when several candidates coincidentally matched the same click', () => {
    const agreement = reviewerAgreementStats([{
      is_approved: true,
      final_bcs: 3.0,
      bcsScore: { is_median_true: true, claude: { is_true: true }, gemini: { is_true: false }, openai: { is_true: false } },
    }]);
    expect(agreement.find((a) => a.key === 'median').count).toBe(1);
    expect(agreement.find((a) => a.key === 'claude').count).toBe(1);
    expect(agreement.find((a) => a.key === 'override').count).toBe(0);
  });

  it('rates a directly-selected provider by how often it was the reviewer\'s final pick, among reviewed analyses only', () => {
    const analyses = [
      { is_approved: true, bcsScore: { gemini: { is_true: true } } },
      { is_approved: true, bcsScore: { gemini: { is_true: true } } },
      { is_approved: false, bcsScore: { claude: { is_true: false } } }, // not reviewed - excluded
    ];
    const agreement = reviewerAgreementStats(analyses);
    expect(agreement.find((a) => a.key === 'gemini')).toEqual({ key: 'gemini', count: 2, rate: 1 });
    expect(agreement.find((a) => a.key === 'claude')).toEqual({ key: 'claude', count: 0, rate: 0 });
  });

  it('reports null rates with no reviewed analyses yet, rather than dividing by zero', () => {
    const agreement = reviewerAgreementStats([{ is_approved: false, bcsScore: {} }]);
    expect(agreement.every((a) => a.rate === null && a.count === 0)).toBe(true);
  });
});

describe('modelInfluenceStats', () => {
  it('credits a directly-selected provider immediately', () => {
    const influence = modelInfluenceStats([{
      is_approved: true,
      final_bcs: 3.5,
      bcsScore: { gemini: { status: 'success', final_bcs: 3.5, is_true: true } },
    }]);
    expect(influence.find((i) => i.key === 'gemini')).toEqual({ key: 'gemini', count: 1, rate: 1 });
  });

  it('credits whichever single provider an accepted median\'s value equals - the common 3-success case', () => {
    // median of [2.0, 2.25, 4.0] is 2.25, which is exactly gemini's own final_bcs
    const influence = modelInfluenceStats([{
      is_approved: true,
      final_bcs: 2.25,
      bcsScore: {
        claude: { status: 'success', final_bcs: 2.0 },
        gemini: { status: 'success', final_bcs: 2.25 },
        openai: { status: 'success', final_bcs: 4.0 },
        is_median_true: true,
      },
    }]);
    expect(influence.find((i) => i.key === 'gemini')).toEqual({ key: 'gemini', count: 1, rate: 1 });
    expect(influence.find((i) => i.key === 'claude').count).toBe(0);
    expect(influence.find((i) => i.key === 'unattributed').count).toBe(0);
  });

  it('falls back to unattributed for a genuinely blended value matching no single provider', () => {
    const influence = modelInfluenceStats([{
      is_approved: true,
      final_bcs: 3.5, // a manual override, matches none of the three
      bcsScore: {
        claude: { status: 'success', final_bcs: 2.0 },
        gemini: { status: 'success', final_bcs: 2.25 },
        openai: { status: 'success', final_bcs: 4.0 },
      },
    }]);
    expect(influence.find((i) => i.key === 'unattributed')).toEqual({ key: 'unattributed', count: 1, rate: 1 });
  });

  it('falls back to unattributed rather than guessing when two providers tie on the same value', () => {
    const influence = modelInfluenceStats([{
      is_approved: true,
      final_bcs: 3.0,
      bcsScore: {
        claude: { status: 'success', final_bcs: 3.0 },
        gemini: { status: 'success', final_bcs: 3.0 },
        openai: { status: 'error', final_bcs: null },
      },
    }]);
    expect(influence.find((i) => i.key === 'unattributed')).toEqual({ key: 'unattributed', count: 1, rate: 1 });
    expect(influence.find((i) => i.key === 'claude').count).toBe(0);
    expect(influence.find((i) => i.key === 'gemini').count).toBe(0);
  });
});

describe('scoreTrend', () => {
  it('averages effectiveScore per ISO week, sorted chronologically', () => {
    const trend = scoreTrend([
      { createdAt: '2026-01-05T00:00:00Z', final_bcs: 3.0 }, // week of Jan 5, 2026
      { createdAt: '2026-01-06T00:00:00Z', final_bcs: 4.0 }, // same week
      { createdAt: '2026-02-02T00:00:00Z', final_bcs: 2.0 }, // later week
    ]);
    expect(trend).toHaveLength(2);
    expect(trend[0].avgScore).toBeCloseTo(3.5);
    expect(trend[1].avgScore).toBeCloseTo(2.0);
    expect(trend[0].week < trend[1].week).toBe(true);
  });

  it('skips analyses with no resolvable score', () => {
    expect(scoreTrend([{ createdAt: '2026-01-05T00:00:00Z', bcsScore: {} }])).toEqual([]);
  });
});

describe('cowsNeedingAttention', () => {
  it('flags thin, heavy, and failed cows; leaves ideal/unscored ones out', () => {
    const cows = [
      { cowsId: '1001', latestAnalysisStatus: 'completed' },
      { cowsId: '1002', latestAnalysisStatus: 'completed' },
      { cowsId: '1003', latestAnalysisStatus: 'completed' },
      { cowsId: '1004', latestAnalysisStatus: 'failed' },
    ];
    const latest = new Map([
      ['1001', { final_bcs: 2.0 }], // thin
      ['1002', { final_bcs: 3.0 }], // ideal - not flagged
      ['1003', { final_bcs: 4.5 }], // heavy
    ]);
    const flagged = cowsNeedingAttention(cows, latest);
    expect(flagged.map((f) => f.cow.cowsId)).toEqual(['1001', '1003', '1004']);
    expect(flagged.map((f) => f.reason)).toEqual(['thin', 'heavy', 'failed']);
  });
});

describe('scoreVolatility', () => {
  const cows = [{ cowsId: '1001' }, { cowsId: '1002' }];

  it('flags a cow whose last two scored analyses swing by at least the threshold', () => {
    const flagged = scoreVolatility(cows, [
      { cowsId: '1001', createdAt: '2026-01-01T00:00:00Z', final_bcs: 3.0 },
      { cowsId: '1001', createdAt: '2026-02-01T00:00:00Z', final_bcs: 4.0 }, // +1.0, most recent
    ]);
    expect(flagged).toEqual([{ cow: cows[0], previousScore: 3.0, latestScore: 4.0, delta: 1.0 }]);
  });

  it('leaves a cow out when the swing is under the threshold, or it has fewer than two scored analyses', () => {
    const flagged = scoreVolatility(cows, [
      { cowsId: '1001', createdAt: '2026-01-01T00:00:00Z', final_bcs: 3.0 },
      { cowsId: '1001', createdAt: '2026-02-01T00:00:00Z', final_bcs: 3.25 }, // +0.25, under the 0.5 default
      { cowsId: '1002', createdAt: '2026-01-01T00:00:00Z', final_bcs: 2.0 }, // only one scored analysis
    ]);
    expect(flagged).toEqual([]);
  });

  it('sorts the most dramatic swings first and respects a custom threshold', () => {
    const flagged = scoreVolatility(cows, [
      { cowsId: '1001', createdAt: '2026-01-01T00:00:00Z', final_bcs: 3.0 },
      { cowsId: '1001', createdAt: '2026-02-01T00:00:00Z', final_bcs: 3.25 }, // +0.25
      { cowsId: '1002', createdAt: '2026-01-01T00:00:00Z', final_bcs: 4.0 },
      { cowsId: '1002', createdAt: '2026-02-01T00:00:00Z', final_bcs: 2.5 }, // -1.5
    ], 0.25);
    expect(flagged.map((f) => f.cow.cowsId)).toEqual(['1002', '1001']);
  });
});

describe('reviewBacklog', () => {
  it('matches AppShell\'s "still needs review" definition exactly', () => {
    const cows = [
      { latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false },
      { latestAnalysisStatus: 'completed', latestAnalysisIsApproved: true },
      { latestAnalysisStatus: 'processing', latestAnalysisIsApproved: false },
    ];
    expect(reviewBacklog(cows)).toHaveLength(1);
  });
});
