import { useState } from 'react';
import { color, radius, shadow, transition } from '../../styles/tokens.js';

// The base surface for every panel, tile, and list row in the app. `hover`
// lifts the card slightly on pointer-over - reserve it for clickable cards
// (herd grid, audit rows) so static cards (KPI tiles, form panels) stay put.
export default function Card({ hover = false, padding = 24, onClick, style, children, ...props }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background: color.bgCard,
        border: `1px solid ${color.borderCard}`,
        borderRadius: radius.card,
        boxShadow: hovered ? shadow.raised : shadow.card,
        padding,
        cursor: onClick ? 'pointer' : 'default',
        transition,
        transform: hovered ? 'translateY(-2px)' : 'none',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
