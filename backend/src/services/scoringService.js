function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

function bandFor(score) {
  if (score < 2.5) return 'thin';
  if (score <= 3.75) return 'ideal';
  return 'heavy';
}

function isSharpDrop(prevScore, newScore) {
  if (prevScore == null) return false;
  return prevScore - newScore >= 0.5;
}

const PROVIDER_NAMES = ['claude', 'gemini', 'openai'];

function reconcileProviders(aiResponse) {
  const providerResults = PROVIDER_NAMES.map((provider) => {
    const raw = aiResponse[provider] || {};
    return {
      provider,
      finalBcs: raw.final_bcs ?? null,
      confidence: raw.confidence ? raw.confidence.toLowerCase() : null,
      status: raw.status || 'error',
      errorMessage: raw.error_message ?? null,
    };
  });

  const successful = providerResults.filter((p) => p.status === 'success' && typeof p.finalBcs === 'number');

  if (successful.length === 0) {
    return { status: 'failed', providerResults, errorMessage: 'All providers failed to produce a score.' };
  }

  const scores = successful.map((p) => p.finalBcs).sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  const medianRaw = scores.length % 2 === 0 ? (scores[mid - 1] + scores[mid]) / 2 : scores[mid];
  const score = roundQuarter(medianRaw);
  const spread = scores[scores.length - 1] - scores[0];

  let confidence;
  if (successful.length < 2) confidence = 'low';
  else if (spread <= 0.25) confidence = 'high';
  else if (spread <= 0.5) confidence = 'medium';
  else confidence = 'low';

  const flagged = confidence === 'low';
  const flagReason = flagged
    ? successful.length < 2
      ? 'Only one model produced a score.'
      : `Models disagreed by ${spread.toFixed(2)} pts.`
    : null;

  return { status: 'scored', score, confidence, spread, flagged, flagReason, providerResults };
}

module.exports = { roundQuarter, bandFor, isSharpDrop, reconcileProviders };
