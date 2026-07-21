import { forwardRef, useState } from 'react';
import { color, radius, font, transition } from '../../styles/tokens.js';

const VARIANTS = {
  primary: {
    base: { background: color.primary, color: '#fff', border: '1px solid transparent' },
    hover: { background: color.primaryDark },
  },
  secondary: {
    base: { background: color.bgCard, color: color.textPrimary, border: `1px solid ${color.border}` },
    hover: { background: color.hover },
  },
  ghost: {
    base: { background: 'transparent', color: color.textSecondary, border: '1px solid transparent' },
    hover: { background: color.hover, color: color.textPrimary },
  },
  danger: {
    base: { background: '#fff', color: color.danger, border: `1px solid ${color.border}` },
    hover: { background: '#FDECEC', border: '1px solid #F6C9C9' },
  },
};

const SIZES = {
  sm: { padding: '7px 12px', fontSize: 13.5 },
  md: { padding: '10px 16px', fontSize: font.size.button },
  lg: { padding: '13px 20px', fontSize: font.size.button },
};

// Shared button primitive - every page should reach for this instead of a
// bespoke inline <button> style, so hover/disabled/focus behavior (and the
// underlying color) stays identical everywhere a button appears.
const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, disabled, style, children, ...props },
  ref
) {
  const [hovered, setHovered] = useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;

  return (
    <button
      ref={ref}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        borderRadius: radius.button,
        fontWeight: font.weight.medium,
        fontFamily: font.family,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition,
        whiteSpace: 'nowrap',
        ...s,
        ...v.base,
        ...(hovered && !disabled ? v.hover : null),
        ...style,
      }}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2} />}
      {children}
      {IconRight && <IconRight size={size === 'sm' ? 14 : 16} strokeWidth={2} />}
    </button>
  );
});

export default Button;
