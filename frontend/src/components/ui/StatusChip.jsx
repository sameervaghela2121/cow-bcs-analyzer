import { color, status, radius, softTint } from '../../styles/tokens.js';

const TONE_COLOR = {
  success: status.healthy,
  warning: status.attention,
  danger: status.critical,
  info: status.information,
  ai: color.ai,
  neutral: status.neutral,
};

// Soft-tint pill used for statuses, confidence, review actions - light
// background, solid-color text, no border. `dot` adds a small leading
// status dot for places (herd cards) that want the signal at a glance.
export default function StatusChip({ tone = 'neutral', label, dot = false, style }) {
  const hex = TONE_COLOR[tone] || TONE_COLOR.neutral;
  const tint = softTint(hex);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12.5,
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: radius.chip,
        ...tint,
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: hex, flexShrink: 0 }} />}
      {label}
    </span>
  );
}
