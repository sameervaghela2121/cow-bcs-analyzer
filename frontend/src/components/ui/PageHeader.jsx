import { color, font } from '../../styles/tokens.js';

// Consistent title/subtitle/actions band at the top of every page. Keep the
// title to the page's noun ("Herd", "Audit Log") - the subtitle carries
// the sentence-length explanation, not the title itself.
export default function PageHeader({ title, subtitle, actions, style }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 28, ...style }}>
      <div>
        <h1 style={{ fontSize: font.size.pageTitle, fontWeight: font.weight.bold, color: color.textPrimary, margin: 0, letterSpacing: -0.5 }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 14, color: color.textSecondary, margin: '6px 0 0', maxWidth: 640, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}
