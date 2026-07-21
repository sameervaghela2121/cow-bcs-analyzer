// Design token system — the single source of truth for the redesigned UI.
// Every page should read colors/spacing/radius/shadow from here rather than
// inlining new hex values, so the app stays visually consistent as it grows.

export const color = {
  primary: '#2E7D32',
  primaryDark: '#1B5E20',
  primarySoft: '#E8F5E9', // sidebar-active / soft primary fills
  success: '#43A047',
  warning: '#F9A825',
  danger: '#D32F2F',
  info: '#0288D1',
  ai: '#7E57C2',
  aiDeep: '#5B21B6', // a darker violet variant of `ai`, for a second series that must read as related-but-distinct (e.g. mean vs. claude in provider charts)

  bgPage: '#F7F8F5',
  bgCard: '#FFFFFF',
  hover: '#F3F4F6',

  border: '#E5E7EB',
  borderCard: '#ECECEC',

  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textOnDark: '#F3F4F0',
  textOnDarkMuted: '#9CA6A0',
};

// Sidebar / dark-surface palette — a calm near-black slate rather than a
// tinted green, so the one saturated green in the whole app stays reserved
// for the primary brand/action color.
export const dark = {
  bg: '#14171A',
  bgElevated: '#1C2024',
  border: '#262B30',
  active: 'rgba(46,125,50,0.22)',
};

// Chart series colors — one meaning per hue, reused everywhere a metric of
// that kind appears (never remixed for decoration).
export const chart = {
  milk: '#2563EB',
  health: '#43A047',
  feed: '#F97316',
  water: '#0D9488',
  aiPrediction: '#7E57C2',
  grid: '#EEF0F2',
  axis: '#9CA3AF',
};

// Status semantics — reused for BCS bands, pipeline status, review actions.
export const status = {
  healthy: color.success,
  attention: color.warning,
  critical: color.danger,
  information: color.info,
  neutral: color.textMuted,
};

export function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Soft tint chip style — light background + solid-color text/icon, the
// "Stripe/Linear badge" look used for statuses, confidence, review actions.
export function softTint(hex) {
  return { background: withAlpha(hex, 0.12), color: hex };
}

export const radius = {
  card: 16,
  button: 12,
  input: 12,
  search: 999,
  chip: 999,
  sm: 8,
};

export const space = [0, 4, 8, 12, 16, 24, 32, 48, 64];

export const shadow = {
  card: '0 8px 30px rgba(0,0,0,0.05)',
  raised: '0 12px 40px rgba(0,0,0,0.10)',
  none: 'none',
};

export const font = {
  family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  size: {
    pageTitle: 32,
    section: 24,
    cardTitle: 18,
    body: 16,
    caption: 13,
    button: 15,
  },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
};

export const transition = 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)';
