import Card from '../ui/Card.jsx';
import Skeleton from '../Skeleton.jsx';
import { color } from '../../styles/tokens.js';

const TILES = [
  { key: 'totalMilk', label: 'Total Milk', format: (v) => `${v.toFixed(1)} L` },
  { key: 'avgPerCow', label: 'Avg per Cow', format: (v) => `${v.toFixed(1)} L` },
  { key: 'cowsReporting', label: 'Cows Reporting', format: (v) => String(v) },
  { key: 'groupsActive', label: 'Groups Active', format: (v) => String(v) },
];

// Four at-a-glance KPI tiles fed by GET /milking-data/summary's `stats`
// object. Pure presentational - the parent page owns fetching/loading state.
export default function StatCards({ stats, isLoading }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
      {TILES.map((tile) => (
        <Card key={tile.key} padding={20}>
          <div style={{ fontSize: 13, color: color.textSecondary, fontWeight: 500 }}>{tile.label}</div>
          {isLoading ? (
            <Skeleton width={80} height={28} style={{ marginTop: 8 }} />
          ) : (
            <div style={{ fontSize: 26, fontWeight: 700, color: color.textPrimary, marginTop: 6 }}>
              {tile.format(stats?.[tile.key] ?? 0)}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
