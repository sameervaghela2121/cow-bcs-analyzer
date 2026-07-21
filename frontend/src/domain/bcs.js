import { color, status, softTint } from '../styles/tokens.js';

export function bandFor(score) {
  if (score == null) return { key: 'unscored', label: 'Not yet scored', color: status.neutral, bg: color.hover };
  if (score < 2.5) return { key: 'thin', label: 'Too thin', color: status.attention, bg: withAlphaBg(status.attention) };
  if (score <= 3.75) return { key: 'ideal', label: 'Ideal', color: status.healthy, bg: withAlphaBg(status.healthy) };
  return { key: 'heavy', label: 'Too heavy', color: status.information, bg: withAlphaBg(status.information) };
}

function withAlphaBg(hex) {
  return softTint(hex).background;
}

export function confidenceStyleFor(confidence) {
  const map = {
    high: softTint(status.healthy),
    medium: softTint(status.attention),
    low: softTint(status.critical),
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

// provider_selected reads as an AI decision endorsed by a reviewer, so it
// borrows the AI-accent hue; overridden is a human deviating from every
// model/statistic, so it reads as an attention-worthy amber.
export const REVIEW_ACTION_META = {
  provider_selected: { label: 'Selected', ...softTint(color.ai) },
  overridden: { label: 'Overridden', ...softTint(status.attention) },
};

export const THEME = {
  '--bg-page': color.bgPage,
  '--bg-card': color.bgCard,
  '--border': color.border,
  '--border-soft': color.borderCard,
  '--border-soft2': color.border,
  '--text-primary': color.textPrimary,
  '--text-secondary': color.textSecondary,
  '--text-tertiary': color.textMuted,
  '--chip-bg': color.hover,
  '--scrollbar': '#D1D5DB',
  '--stepper-bg': color.bgPage,
};
