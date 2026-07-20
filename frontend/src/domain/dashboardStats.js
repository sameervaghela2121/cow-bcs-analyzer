import { bandFor, PROVIDERS, medianOfScores } from './bcs.js';

// The single "best current score" for an analysis. Once reviewed,
// analysis.final_bcs is always it (server-set, never re-derived here) -
// before that, a live preview of the same median the Review page shows,
// computed fresh from whichever providers succeeded.
export function effectiveScore(analysis) {
  if (analysis?.final_bcs != null) return analysis.final_bcs;
  const bcsScore = analysis?.bcsScore || {};
  const scores = PROVIDERS
    .map((provider) => bcsScore[provider])
    .filter((assessment) => assessment?.status === 'success' && assessment?.final_bcs != null)
    .map((assessment) => assessment.final_bcs);
  return medianOfScores(scores);
}

// Analyses arrive per-cow, newest first, from cowsApi.analyses() - this
// flattens a herd-wide list down to one record per cow (its most recent),
// the same "latest analysis" concept HerdPage/AppShell already key off of.
export function latestAnalysisPerCow(allAnalyses) {
  const latestByCow = new Map();
  for (const analysis of allAnalyses) {
    const current = latestByCow.get(analysis.cowsId);
    if (!current || new Date(analysis.createdAt) > new Date(current.createdAt)) {
      latestByCow.set(analysis.cowsId, analysis);
    }
  }
  return latestByCow;
}

// Counts each cow's latest analysis into bandFor's thin/ideal/heavy/unscored
// buckets - the exact same bands CowDetailPage/ReviewPage color-code scores
// with, so the dashboard never introduces a second definition of "thin".
export function bcsDistribution(latestByCow) {
  const counts = { thin: 0, ideal: 0, heavy: 0, unscored: 0 };
  for (const analysis of latestByCow.values()) {
    const band = bandFor(effectiveScore(analysis));
    counts[band.key] += 1;
  }
  return counts;
}

export function pipelineStatusCounts(allAnalyses) {
  const counts = { not_started: 0, processing: 0, completed: 0, failed: 0 };
  for (const analysis of allAnalyses) {
    if (analysis.status in counts) counts[analysis.status] += 1;
  }
  return counts;
}

// How often a reviewer's final pick actually lands on each candidate, among
// analyses reviewed so far - a trust signal ("which source do reviewers
// keep agreeing with"). Reads bcsScore's is_true/is_mean_true/is_median_true
// flags directly - the backend already resolved exactly which candidates
// matched the picked value (see bcsAnalysisController.applySelection), so
// there's no reconstruction or float-comparison needed here anymore. A
// single pick can land in more than one bucket at once (e.g. Median picked,
// and Claude happened to agree) - both get credit, so rates can sum past 100%.
export function reviewerAgreementStats(allAnalyses) {
  const reviewed = allAnalyses.filter((a) => a.is_approved);
  const counts = { median: 0, mean: 0, override: 0, claude: 0, gemini: 0, openai: 0 };
  for (const analysis of reviewed) {
    const bcsScore = analysis?.bcsScore || {};
    const matched = [];
    if (bcsScore.is_median_true) matched.push('median');
    if (bcsScore.is_mean_true) matched.push('mean');
    for (const provider of PROVIDERS) {
      if (bcsScore[provider]?.is_true) matched.push(provider);
    }
    if (matched.length === 0) counts.override += 1; // nothing matched -> a manual override
    else for (const key of matched) counts[key] += 1;
  }
  const total = reviewed.length;
  return ['median', 'mean', 'override', ...PROVIDERS].map((key) => ({
    key,
    count: counts[key],
    rate: total > 0 ? counts[key] / total : null,
  }));
}

// Who the final score actually came from, regardless of how the reviewer
// got there - a direct pick, or an accepted median/mean/override value that
// happens to equal one specific provider's own final_bcs. Complements
// reviewerAgreementStats (which button did the reviewer click) with a
// different question (whose number is actually driving the record). Values
// are exact quarter-point numbers on both sides, so a plain === is safe -
// no epsilon needed.
export function modelInfluenceStats(allAnalyses) {
  const reviewed = allAnalyses.filter((a) => a.is_approved);
  const counts = { claude: 0, gemini: 0, openai: 0, unattributed: 0 };
  for (const analysis of reviewed) {
    const bcsScore = analysis?.bcsScore || {};
    const finalScore = analysis.final_bcs;
    const matchingProviders = PROVIDERS.filter((provider) => {
      const assessment = bcsScore[provider];
      return assessment?.status === 'success' && assessment?.final_bcs != null && assessment.final_bcs === finalScore;
    });
    // Exactly one match -> that provider's number is what the record's
    // score actually is. Zero matches (a genuinely blended value) or more
    // than one (two providers tied, so which one "really" produced it is
    // unknowable) both fall back to 'unattributed' rather than guessing.
    if (matchingProviders.length === 1) counts[matchingProviders[0]] += 1;
    else counts.unattributed += 1;
  }
  const total = reviewed.length;
  return [...PROVIDERS, 'unattributed'].map((key) => ({
    key,
    count: counts[key],
    rate: total > 0 ? counts[key] / total : null,
  }));
}

function isoWeekKey(dateStr) {
  const date = new Date(dateStr);
  // Nearest Thursday-of-the-week trick: shifts the date so getUTCFullYear()
  // reads off the correct ISO week-year even for the first/last days of a year.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Weekly average of effectiveScore across every analysis (not just the
// latest per cow) - a rising/falling trend across all submissions, not a
// single snapshot.
export function scoreTrend(allAnalyses) {
  const buckets = new Map();
  for (const analysis of allAnalyses) {
    const score = effectiveScore(analysis);
    if (score == null || !analysis.createdAt) continue;
    const key = isoWeekKey(analysis.createdAt);
    if (!buckets.has(key)) buckets.set(key, { week: key, sum: 0, count: 0 });
    const bucket = buckets.get(key);
    bucket.sum += score;
    bucket.count += 1;
  }
  return [...buckets.values()]
    .sort((a, b) => (a.week > b.week ? 1 : -1))
    .map((bucket) => ({ week: bucket.week, avgScore: bucket.sum / bucket.count }));
}

// Cows worth a look right now: too thin/heavy per the latest completed
// score, or whose most recent upload failed outright.
export function cowsNeedingAttention(cows, latestByCow) {
  return cows
    .map((cow) => {
      const latest = latestByCow.get(cow.cowsId);
      const band = latest ? bandFor(effectiveScore(latest)) : null;
      const reason =
        cow.latestAnalysisStatus === 'failed'
          ? 'failed'
          : band && (band.key === 'thin' || band.key === 'heavy')
          ? band.key
          : null;
      return reason ? { cow, reason, band } : null;
    })
    .filter(Boolean);
}

const VOLATILITY_THRESHOLD = 0.5; // quarter-point scale; a half-point swing between consecutive analyses is a real condition change, not scoring noise

// Cows whose score swung sharply between their two most recent *scored*
// analyses - an early-warning signal (rapid loss/gain often means illness
// or a feeding problem), unlike cowsNeedingAttention's static "where does
// the herd stand right now" snapshot. Only analyses with a resolvable
// effectiveScore count, so a still-processing or failed upload never
// displaces a cow's real last two readings.
export function scoreVolatility(cows, allAnalyses, threshold = VOLATILITY_THRESHOLD) {
  const scoredByCow = new Map();
  for (const analysis of allAnalyses) {
    const score = effectiveScore(analysis);
    if (score == null || !analysis.createdAt) continue;
    if (!scoredByCow.has(analysis.cowsId)) scoredByCow.set(analysis.cowsId, []);
    scoredByCow.get(analysis.cowsId).push({ score, createdAt: analysis.createdAt });
  }
  const cowByCowsId = new Map(cows.map((cow) => [cow.cowsId, cow]));
  const flagged = [];
  for (const [cowsId, scored] of scoredByCow) {
    if (scored.length < 2) continue;
    scored.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const [latest, previous] = scored;
    const delta = latest.score - previous.score;
    if (Math.abs(delta) >= threshold) {
      flagged.push({ cow: cowByCowsId.get(cowsId) || { cowsId }, latestScore: latest.score, previousScore: previous.score, delta });
    }
  }
  return flagged.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// The exact predicate AppShell's sidebar badge already uses for "still
// needs review" - factored out here so the dashboard's count and the
// sidebar's count can never drift apart into two different definitions.
export function reviewBacklog(cows) {
  return cows.filter((cow) => cow.latestAnalysisStatus === 'completed' && !cow.latestAnalysisIsApproved);
}

// Analyses flagged is_critical (providers disagreed by more than 0.5 BCS
// points) that haven't been reviewed yet - these deserve priority attention
// since accepting a computed median/mean on a critical one papers over a
// real disagreement between models rather than resolving it.
export function criticalReviewBacklog(allAnalyses) {
  return allAnalyses.filter((a) => a.bcsScore?.is_critical && !a.is_approved);
}
