import { render, screen, within, fireEvent } from '@testing-library/react';
import MilkingRecordsTable from '../../../src/components/milking/MilkingRecordsTable.jsx';

const records = [
  { id: 'r1', milkSessionAt: '2026-08-01T12:00:00Z', cowsId: '232', currentGroup: '1.1', shift: 'Morning', milk: 12.5 },
  { id: 'r2', milkSessionAt: '2026-08-01T12:00:00Z', cowsId: '241', currentGroup: '2.1', shift: 'Afternoon', milk: 9.5 },
  { id: 'r3', milkSessionAt: '2026-08-02T12:00:00Z', cowsId: '232', currentGroup: '1.1', shift: 'Evening', milk: 11 },
];

function baseProps(overrides = {}) {
  return {
    records,
    total: records.length,
    limit: 50,
    offset: 0,
    sortBy: undefined,
    sortOrder: undefined,
    isLoading: false,
    onPageChange: vi.fn(),
    onSortChange: vi.fn(),
    ...overrides,
  };
}

function bodyRows() {
  // Skip the header row.
  return screen.getAllByRole('row').slice(1);
}

describe('MilkingRecordsTable', () => {
  it('renders one row per record with the correct Date/Cow#/Group/Shift/Milk values', () => {
    render(<MilkingRecordsTable {...baseProps()} />);
    const rows = bodyRows();
    expect(rows).toHaveLength(3);

    expect(within(rows[0]).getByText('Aug 1, 2026')).toBeInTheDocument();
    expect(within(rows[0]).getByText('232')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1.1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Morning')).toBeInTheDocument();
    expect(within(rows[0]).getByText('12.50')).toBeInTheDocument();

    expect(within(rows[1]).getByText('241')).toBeInTheDocument();
    expect(within(rows[1]).getByText('2.1')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Afternoon')).toBeInTheDocument();
    expect(within(rows[1]).getByText('9.50')).toBeInTheDocument();

    expect(within(rows[2]).getByText('Aug 2, 2026')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Evening')).toBeInTheDocument();
    expect(within(rows[2]).getByText('11.00')).toBeInTheDocument();
  });

  it('renders skeleton rows instead of record rows when isLoading is true', () => {
    render(<MilkingRecordsTable {...baseProps({ isLoading: true })} />);
    const rows = bodyRows();
    expect(rows).toHaveLength(5);
    expect(screen.queryByText('232')).not.toBeInTheDocument();
    expect(screen.queryByText('Morning')).not.toBeInTheDocument();
    expect(screen.queryByText('No records found.')).not.toBeInTheDocument();
  });

  it('renders "No records found." when records is empty and not loading', () => {
    render(<MilkingRecordsTable {...baseProps({ records: [], total: 0 })} />);
    expect(screen.getByText('No records found.')).toBeInTheDocument();
  });

  it('hides pagination when totalPages <= 1', () => {
    render(<MilkingRecordsTable {...baseProps({ total: 3, limit: 50, offset: 0 })} />);
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next/i })).not.toBeInTheDocument();
  });

  it('shows correct pagination and enables both buttons when in the middle of the range', () => {
    render(<MilkingRecordsTable {...baseProps({ total: 120, limit: 50, offset: 50 })} />);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
  });

  it('calls onPageChange(3) when clicking Next while on page 2', () => {
    const onPageChange = vi.fn();
    render(<MilkingRecordsTable {...baseProps({ total: 120, limit: 50, offset: 50, onPageChange })} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('disables Previous on page 1 and disables Next on the last page', () => {
    const { rerender } = render(<MilkingRecordsTable {...baseProps({ total: 120, limit: 50, offset: 0 })} />);
    expect(screen.getByRole('button', { name: /Previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();

    rerender(<MilkingRecordsTable {...baseProps({ total: 120, limit: 50, offset: 100 })} />);
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Previous/i })).not.toBeDisabled();
  });

  it('toggles sort direction when clicking the Date column header', () => {
    const onSortChange = vi.fn();
    const { rerender } = render(<MilkingRecordsTable {...baseProps({ onSortChange })} />);
    const dateHeader = screen.getByRole('columnheader', { name: /^Date/ });
    fireEvent.click(dateHeader);
    expect(onSortChange).toHaveBeenCalledWith('date', 'asc');

    onSortChange.mockClear();
    rerender(<MilkingRecordsTable {...baseProps({ sortBy: 'date', sortOrder: 'asc', onSortChange })} />);
    fireEvent.click(screen.getByRole('columnheader', { name: /^Date/ }));
    expect(onSortChange).toHaveBeenCalledWith('date', 'desc');
  });
});
