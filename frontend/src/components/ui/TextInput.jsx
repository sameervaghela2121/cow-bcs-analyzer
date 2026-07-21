import { forwardRef, useState } from 'react';
import { color, radius, transition } from '../../styles/tokens.js';

// Shared text input look: 12px radius, hairline border, a visible but
// quiet focus ring in the primary color. `pill` switches to the 999px
// "search" radius for search-style fields.
const TextInput = forwardRef(function TextInput({ pill = false, style, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      ref={ref}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: pill ? '10px 18px' : '11px 14px',
        fontSize: 14.5,
        borderRadius: pill ? radius.search : radius.input,
        border: `1px solid ${focused ? color.primary : color.border}`,
        boxShadow: focused ? `0 0 0 3px rgba(46,125,50,0.12)` : 'none',
        background: color.bgCard,
        color: color.textPrimary,
        transition,
        outline: 'none',
        ...style,
      }}
      {...props}
    />
  );
});

export default TextInput;
