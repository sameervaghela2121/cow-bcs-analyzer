import { statusLabel, statusColor } from '../domain/analysisStatus.js';

export default function StatusPill({ status }) {
  if (!status) return null;
  const color = statusColor(status);
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11.5,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 999,
        background: `${color}1a`,
        color,
      }}
    >
      {statusLabel(status)}
    </span>
  );
}
