const PROVIDERS = ['claude', 'gemini', 'openai'];

// BCS scores are always quarter-point increments everywhere in this system
// (ai-backend rounds every provider's final_bcs this same way) - a manually
// typed override must land on the same scale.
function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

function successfulScores(bcsScore) {
  return PROVIDERS
    .map((p) => bcsScore?.[p])
    .filter((assessment) => assessment?.status === 'success' && assessment?.final_bcs != null)
    .map((assessment) => assessment.final_bcs);
}

// Mirrors ai-backend's own mean calculation exactly (bcs_service.py) - kept
// here so the Node backend can recompute it fresh on every read instead of
// a stored value ever needing to be kept in sync with the raw scores.
function meanOfScores(scores) {
  if (scores.length === 0) return null;
  return roundQuarter(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

// Mirrors ai-backend's statistics.median (average the two middle values for
// an even count), rounded the same way.
function medianOfScores(scores) {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return roundQuarter(raw);
}

module.exports = { PROVIDERS, roundQuarter, successfulScores, meanOfScores, medianOfScores };
