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

export const THEMES = {
  light: {
    '--bg-page': '#f6f5f0', '--bg-card': '#ffffff', '--border': '#e5e0d3', '--border-soft': '#d8d2c2',
    '--border-soft2': '#e2ddd0', '--text-primary': '#20241f', '--text-secondary': '#82796a',
    '--text-tertiary': '#9a9280', '--chip-bg': '#efece1', '--scrollbar': '#cfc9ba', '--stepper-bg': '#f6f5f0',
  },
  dark: {
    '--bg-page': '#14170f', '--bg-card': '#1e231b', '--border': '#333a2c', '--border-soft': '#3a4432',
    '--border-soft2': '#333a2c', '--text-primary': '#eee8d8', '--text-secondary': '#a39c86',
    '--text-tertiary': '#8a8370', '--chip-bg': '#262b21', '--scrollbar': '#3a4432', '--stepper-bg': '#20241f',
  },
};
