import { bandFor } from './bcs.js';

const PROVIDERS = ['claude', 'gemini', 'openai'];

// The single "best current score" for an analysis. A reviewer's pick
// (median/claude/gemini/openai's is_selected) always wins once one exists;
// before that, fall back to the AI's own best estimate. bcs_analysis
// documents in the wild aren't all one shape - older records only ever had
// bcsScore.mean_bcs_score, newer ones moved mean_bcs_score to the document
// root and added median_bcs_score - so every fallback here is load-bearing,
// not defensive-for-its-own-sake.
export function effectiveScore(analysis) {
  const bcsScore = analysis?.bcsScore || {};
  if (bcsScore.median_bcs_score?.is_selected) return bcsScore.median_bcs_score.score;
  for (const provider of PROVIDERS) {
    if (bcsScore[provider]?.is_selected) return bcsScore[provider].final_bcs;
  }
  return (
    analysis?.mean_bcs_score ??
    bcsScore.median_bcs_score?.score ??
    bcsScore.mean_bcs_score ??
    null
  );
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

function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const CLOSE_ENOUGH = 0.01; // both sides are quarter-point values; guards only against float noise

// Reconstructs the AI's *original* median_bcs_score.score from the
// per-provider final_bcs values - those fields are never touched by any
// review action (approve/select/override only ever change
// bcsScore.median_bcs_score.score and the various is_selected flags), so
// this reproduces the original median even on a record a reviewer has since
// overridden. Mirrors ai-backend's own computation exactly: statistics.median
// over whichever providers succeeded, rounded to the nearest quarter point
// (ai-backend/app/services/bcs_service.py).
function aiComputedMedian(analysis) {
  const bcsScore = analysis?.bcsScore || {};
  const successfulScores = PROVIDERS
    .map((provider) => bcsScore[provider])
    .filter((assessment) => assessment?.status === 'success' && assessment?.final_bcs != null)
    .map((assessment) => assessment.final_bcs);
  return successfulScores.length > 0 ? roundQuarter(median(successfulScores)) : null;
}

// How often a reviewer's final pick actually lands on each candidate, among
// analyses that have been reviewed so far - a trust signal ("which source do
// reviewers keep agreeing with"), not whether the API call itself came back
// with a score.
//
// Approve and override both flip bcsScore.median_bcs_score.is_selected the
// same way, so a plain is_selected check can't tell "reviewer accepted the
// AI's median as-is" from "reviewer typed in their own number" - lumping
// those together would make a real override look like the median performing
// well. Instead, whenever median_bcs_score is the pick, its *current* score
// is compared against the AI's original median (reconstructed via
// aiComputedMedian, since override overwrites the field in place) and
// against the AI's mean (mean_bcs_score, which override never touches):
//   - matches the recomputed median -> reviewer accepted the AI's median as-is
//   - matches the mean instead      -> an override that happens to agree
//     with the AI's average - real evidence the mean was the right call,
//     credited to 'mean' rather than miscounted as a median win
//   - matches neither                -> a genuine manual override, its own
//     bucket rather than folded into 'median'
export function reviewerAgreementStats(allAnalyses) {
  const reviewed = allAnalyses.filter((a) => a.is_approved);
  const counts = { median: 0, mean: 0, override: 0, claude: 0, gemini: 0, openai: 0 };
  for (const analysis of reviewed) {
    const bcsScore = analysis?.bcsScore || {};
    if (bcsScore.median_bcs_score?.is_selected) {
      const current = bcsScore.median_bcs_score.score;
      const aiMedian = aiComputedMedian(analysis);
      const aiMean = analysis?.mean_bcs_score ?? bcsScore.mean_bcs_score ?? null;
      if (aiMedian != null && Math.abs(current - aiMedian) < CLOSE_ENOUGH) counts.median += 1;
      else if (aiMean != null && Math.abs(current - aiMean) < CLOSE_ENOUGH) counts.mean += 1;
      else counts.override += 1;
    }
    for (const provider of PROVIDERS) {
      if (bcsScore[provider]?.is_selected) counts[provider] += 1;
    }
  }
  const total = reviewed.length;
  return ['median', 'mean', 'override', ...PROVIDERS].map((key) => ({
    key,
    count: counts[key],
    rate: total > 0 ? counts[key] / total : null,
  }));
}

// Who the final score actually came from, regardless of how the reviewer
// got there - a direct pick, or an accepted/overridden median value that
// happens to equal one specific provider's own final_bcs. Complements
// reviewerAgreementStats (which button did the reviewer click) with a
// different question (whose number is actually driving the record): with 3
// successful providers the median is mathematically always exactly one of
// them, so a "median accepted" win in that chart is really a win for
// whichever provider ranked in the middle that time.
export function modelInfluenceStats(allAnalyses) {
  const reviewed = allAnalyses.filter((a) => a.is_approved);
  const counts = { claude: 0, gemini: 0, openai: 0, unattributed: 0 };
  for (const analysis of reviewed) {
    const bcsScore = analysis?.bcsScore || {};
    const directPick = PROVIDERS.find((provider) => bcsScore[provider]?.is_selected);
    if (directPick) {
      counts[directPick] += 1;
      continue;
    }
    if (!bcsScore.median_bcs_score?.is_selected) continue; // clearSelections guarantees one of the checks above is always true
    const finalScore = bcsScore.median_bcs_score.score;
    const matchingProviders = PROVIDERS.filter((provider) => {
      const assessment = bcsScore[provider];
      return (
        assessment?.status === 'success' &&
        assessment?.final_bcs != null &&
        Math.abs(assessment.final_bcs - finalScore) < CLOSE_ENOUGH
      );
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
