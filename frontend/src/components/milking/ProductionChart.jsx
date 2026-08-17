import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../ui/Card.jsx';
import Skeleton from '../Skeleton.jsx';
import { Button } from '../ui/index.js';
import { color, chart } from '../../styles/tokens.js';

const SHIFT_COLORS = { Morning: chart.milk, Afternoon: chart.feed, Evening: chart.aiPrediction };

// Daily milk production, fed by GET /milking-data/summary's `daily` array.
// Toggling total vs. by-shift is controlled by the parent (`showByShift` /
// `onToggleByShift`) - this component holds no state of its own.
export default function ProductionChart({ daily, isLoading, showByShift, onToggleByShift }) {
  const data = (daily ?? []).map((d) => ({
    ...d,
    Morning: d.byShift?.Morning ?? 0,
    Afternoon: d.byShift?.Afternoon ?? 0,
    Evening: d.byShift?.Evening ?? 0,
  }));
  return (
    <Card padding={20} style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: color.textPrimary }}>Daily Milk Production</div>
        <Button variant="secondary" size="sm" onClick={onToggleByShift}>
          {showByShift ? 'Show Total' : 'Show by Shift'}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton height={280} />
      ) : data.length === 0 ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.textMuted, fontSize: 14 }}>
          No milking records in this range.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          {showByShift ? (
            <BarChart data={data}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="date" stroke={chart.axis} fontSize={12} />
              <YAxis stroke={chart.axis} fontSize={12} />
              <Tooltip />
              <Bar dataKey="Morning" stackId="shift" name="Morning" fill={SHIFT_COLORS.Morning} />
              <Bar dataKey="Afternoon" stackId="shift" name="Afternoon" fill={SHIFT_COLORS.Afternoon} />
              <Bar dataKey="Evening" stackId="shift" name="Evening" fill={SHIFT_COLORS.Evening} />
            </BarChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="date" stroke={chart.axis} fontSize={12} />
              <YAxis stroke={chart.axis} fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="totalMilk" name="Total Milk" stroke={chart.milk} strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      )}
    </Card>
  );
}
