import { confidenceStyleFor } from '../domain/bcs.js';

export default function ConfidencePill({ confidence }) {
  const style = confidenceStyleFor(confidence);
  return (
    <span style={{ ...style, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, textTransform: 'capitalize' }}>
      {confidence}
    </span>
  );
}
