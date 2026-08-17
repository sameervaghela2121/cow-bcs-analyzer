import { useQuery } from '@tanstack/react-query';
import { cowGroupsApi } from '../../api/cowGroups.js';
import { cowsApi } from '../../api/cows.js';
import Card from '../ui/Card.jsx';
import { TextInput } from '../ui/index.js';
import { color } from '../../styles/tokens.js';

const SHIFTS = ['Morning', 'Afternoon', 'Evening'];

const fieldWrapStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: color.textSecondary };
const selectStyle = {
  padding: '11px 14px',
  fontSize: 14.5,
  borderRadius: 12,
  border: `1px solid ${color.border}`,
  background: color.bgCard,
  color: color.textPrimary,
};

// Owns its own dropdown option lists (groups + cows) via React Query - the
// parent page only owns the actual filter VALUES (URL-driven) and passes
// them down as controlled-input props plus a single onFilterChange callback.
export default function MilkingFilterBar({ startDate, endDate, groupId, cowId, shift, onFilterChange }) {
  const { data: groupsData } = useQuery({
    queryKey: ['cow-groups'],
    queryFn: () => cowGroupsApi.list(),
    staleTime: 300000,
  });
  const { data: cowsData } = useQuery({
    queryKey: ['cows-for-filter'],
    queryFn: () => cowsApi.list({ limit: 100 }),
    staleTime: 60000,
  });
  const groups = groupsData?.cowGroups ?? [];
  const cows = cowsData?.cows ?? [];

  return (
    <Card padding={16} style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
      <div style={fieldWrapStyle}>
        <label style={labelStyle} htmlFor="milking-filter-start">From</label>
        <TextInput id="milking-filter-start" type="date" value={startDate || ''} onChange={(e) => onFilterChange('startDate', e.target.value)} style={{ width: 150 }} />
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle} htmlFor="milking-filter-end">To</label>
        <TextInput id="milking-filter-end" type="date" value={endDate || ''} onChange={(e) => onFilterChange('endDate', e.target.value)} style={{ width: 150 }} />
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle} htmlFor="milking-filter-group">Group</label>
        <select id="milking-filter-group" value={groupId || ''} onChange={(e) => onFilterChange('groupId', e.target.value || undefined)} style={selectStyle}>
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle} htmlFor="milking-filter-cow">Cow</label>
        <select id="milking-filter-cow" value={cowId || ''} onChange={(e) => onFilterChange('cowId', e.target.value || undefined)} style={selectStyle}>
          <option value="">All Cows</option>
          {cows.map((c) => (
            <option key={c.id} value={c.id}>{c.cowsId}</option>
          ))}
        </select>
      </div>
      <div style={fieldWrapStyle}>
        <label style={labelStyle} htmlFor="milking-filter-shift">Shift</label>
        <select id="milking-filter-shift" value={shift || ''} onChange={(e) => onFilterChange('shift', e.target.value || undefined)} style={selectStyle}>
          <option value="">All Shifts</option>
          {SHIFTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </Card>
  );
}
