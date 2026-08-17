import { ChevronLeft, ChevronRight } from 'lucide-react';
import Card from '../ui/Card.jsx';
import Skeleton from '../Skeleton.jsx';
import { Button } from '../ui/index.js';
import { color } from '../../styles/tokens.js';

const thStyle = { textAlign: 'left', padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: color.textSecondary, borderBottom: `1px solid ${color.borderCard}`, cursor: 'pointer', userSelect: 'none' };
const tdStyle = { padding: '12px 16px', fontSize: 14, color: color.textPrimary, borderBottom: `1px solid ${color.borderCard}` };

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortIndicator(active, sortOrder) {
  if (!active) return '';
  return sortOrder === 'asc' ? ' ▲' : ' ▼';
}

// Purely presentational - the parent page does all data fetching and owns
// pagination/sort state, mirroring HerdPage's goToPage convention (1-indexed
// page numbers, not offsets).
export default function MilkingRecordsTable({ records, total, limit, offset, sortBy, sortOrder, isLoading, onPageChange, onSortChange }) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function headerClick(field) {
    onSortChange(field, sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc');
  }

  return (
    <Card padding={0}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => headerClick('date')}>Date{sortIndicator(sortBy === 'date', sortOrder)}</th>
              <th style={thStyle}>Cow #</th>
              <th style={thStyle}>Group</th>
              <th style={thStyle}>Shift</th>
              <th style={thStyle} onClick={() => headerClick('milk')}>Milk (L){sortIndicator(sortBy === 'milk', sortOrder)}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} style={tdStyle}><Skeleton height={16} /></td>
                </tr>
              ))}
            {!isLoading &&
              records.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{fmtDate(r.milkSessionAt)}</td>
                  <td style={tdStyle}>{r.cowsId}</td>
                  <td style={tdStyle}>{r.currentGroup}</td>
                  <td style={tdStyle}>{r.shift}</td>
                  <td style={tdStyle}>{r.milk.toFixed(2)}</td>
                </tr>
              ))}
            {!isLoading && records.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: color.textMuted }}>No records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 }}>
          <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            Previous
          </Button>
          <span style={{ fontSize: 13, color: color.textSecondary, fontWeight: 500 }}>Page {page} of {totalPages}</span>
          <Button variant="secondary" size="sm" iconRight={ChevronRight} onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      )}
    </Card>
  );
}
