import { color, radius } from '../../styles/tokens.js';

// Calm, low-decoration empty state - an icon in a soft circle, a short
// title, an optional one-line description, and an optional action. No
// illustrations; the icon carries just enough context.
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div
      style={{
        border: `1px dashed ${color.border}`,
        borderRadius: radius.card,
        padding: '56px 24px',
        textAlign: 'center',
        background: color.bgCard,
      }}
    >
      {Icon && (
        <div
          style={{
            width: 44, height: 44, borderRadius: '50%', background: color.hover,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}
        >
          <Icon size={20} color={color.textMuted} strokeWidth={1.75} />
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 600, color: color.textPrimary }}>{title}</div>
      {description && (
        <div style={{ fontSize: 13.5, color: color.textSecondary, marginTop: 6, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}
