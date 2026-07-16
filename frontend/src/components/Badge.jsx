import { bandFor, formatScore } from '../domain/bcs.js';

export default function Badge({ score }) {
  const band = bandFor(score);
  return (
    <span style={{ color: '#fff', background: band.color, fontSize: '13.5px', fontWeight: 800, padding: '4px 11px', borderRadius: 999 }}>
      {formatScore(score)}
    </span>
  );
}
