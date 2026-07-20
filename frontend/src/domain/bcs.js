export function bandFor(score) {
  if (score == null) return { key: 'unscored', label: 'Not yet scored', color: '#82796a', bg: '#efece1' };
  if (score < 2.5) return { key: 'thin', label: 'Too thin', color: '#b45309', bg: '#fbeedd' };
  if (score <= 3.75) return { key: 'ideal', label: 'Ideal', color: '#166534', bg: '#e6f2e8' };
  return { key: 'heavy', label: 'Too heavy', color: '#1d4ed8', bg: '#e8edfc' };
}

export function confidenceStyleFor(confidence) {
  const map = {
    high: { color: '#ffffff', background: '#166534' },
    medium: { color: '#ffffff', background: '#a35a05' },
    low: { color: '#ffffff', background: '#b91c1c' },
  };
  return map[confidence] || map.high;
}

export function formatScore(score) {
  if (score == null) return '—';
  return score.toFixed(2).replace(/0$/, '').replace(/\.$/, '.0');
}

export const PROVIDERS = ['claude', 'gemini', 'openai'];
export const PROVIDER_LABELS = { claude: 'Claude', gemini: 'Gemini', openai: 'OpenAI' };

// Same math the backend uses (backend/src/services/bcsScoring.js), ported
// here so the Review page can preview the recomputed score client-side
// before a Save actually commits it.
function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}
export function meanOfScores(scores) {
  if (scores.length === 0) return null;
  return roundQuarter(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}
export function medianOfScores(scores) {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return roundQuarter(raw);
}

// analysis.final_bcs is always the score to show (server-computed the same
// way, never re-derived here) - this only figures out the human-readable
// "why", from whichever is_true/is_mean_true/is_median_true flags matched
// when the reviewer picked it. Several can be true at once (e.g. Median
// picked and a provider happened to agree) - join them. None true at all
// means it was a manual Override, which isn't matched against anything.
export function describeFinalScore(analysis) {
  if (!analysis || analysis.final_bcs == null) return null;
  const bcsScore = analysis.bcsScore || {};
  const matched = [];
  for (const [key, label] of Object.entries(PROVIDER_LABELS)) {
    if (bcsScore[key]?.is_true) matched.push(label);
  }
  if (bcsScore.is_mean_true) matched.push('Mean');
  if (bcsScore.is_median_true) matched.push('Median');
  return { label: matched.length > 0 ? matched.join(' + ') : 'Override', score: analysis.final_bcs };
}

export const REVIEW_ACTION_META = {
  provider_selected: { label: 'Selected', color: '#1d4ed8', background: '#e8edfc' },
  overridden: { label: 'Overridden', color: '#b45309', background: '#fdf1de' },
};

export const THEME = {
  '--bg-page': '#f6f5f0', '--bg-card': '#ffffff', '--border': '#e5e0d3', '--border-soft': '#d8d2c2',
  '--border-soft2': '#e2ddd0', '--text-primary': '#20241f', '--text-secondary': '#82796a',
  '--text-tertiary': '#9a9280', '--chip-bg': '#efece1', '--scrollbar': '#cfc9ba', '--stepper-bg': '#f6f5f0',
};
